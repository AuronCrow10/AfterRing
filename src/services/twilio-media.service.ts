// src/services/twilio-media.service.ts
import WebSocket, { WebSocketServer } from 'ws';
import type { RawData } from 'ws';
import type { IncomingMessage } from 'http';
import logger from '../config/logger';
import type {
  TwilioMediaStreamEvent,
  TwilioMediaStreamStartEvent,
  TwilioMediaStreamMediaEvent
} from '../types/twilio';
import { prisma } from '../config/db';
import { RealtimeSessionService } from './realtime-session.service';
import { toolsRouterService } from './tools-router.service';
import { deepgramTtsService } from './deepgram-tts.service';
import { usageService } from './usage.service';
import { clientService } from './client.service';
import { env } from '../config/env';
import { diffInSecondsCeil } from '../utils/time';
import { createBargeInDetector } from '../utils/barge-in';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseQuery(req: IncomingMessage): { callSessionId: string | null; token: string | null } {
  const url = new URL(req.url || '', 'http://localhost');
  return {
    callSessionId: url.searchParams.get('callSessionId'),
    token: url.searchParams.get('token')
  };
}

class TwilioMediaStreamHandler {
  private ws: WebSocket;
  private callSid: string | null = null;
  private streamSid: string | null = null;
  private realtime: RealtimeSessionService | null = null;
  private ended = false;
  private speaking = false;
  private playbackId = 0;
  private bargeInDetector = createBargeInDetector({
    avgAbsThreshold: env.BARGE_IN_AVG_ABS_THRESHOLD,
    framesRequired: env.BARGE_IN_FRAMES_REQUIRED
  });
  private startedAt: Date | null = null;
  private initOk = false;
  private callSessionId: string | null = null;
  private urlCallSessionId: string | null = null;
  private urlToken: string | null = null;

  constructor(ws: WebSocket, req: IncomingMessage) {
    this.ws = ws;
    const { callSessionId, token } = parseQuery(req);
    this.urlCallSessionId = callSessionId;
    this.urlToken = token;

    ws.on('message', (data: RawData) => {
      void this.handleMessage(data);
    });

    ws.on('close', (code, reason) => {
      logger.info(
        { code, reason: reason.toString(), callSid: this.callSid, streamSid: this.streamSid },
        'Twilio media WebSocket closed'
      );
      void this.finishIfNeeded('failed');
    });

    ws.on('error', (err) => {
      logger.error(
        { err, callSid: this.callSid, streamSid: this.streamSid },
        'Twilio media WebSocket error'
      );
      void this.finishIfNeeded('failed');
    });
  }

  private async initialize(callSessionId: string | null, token: string | null) {
    if (!callSessionId || !token) {
      logger.warn('Missing callSessionId or token in Twilio media stream start parameters');
      this.ws.close(1008, 'Unauthorized');
      return;
    }

    const callSession = await prisma.callSession.findFirst({
      where: { id: callSessionId, mediaStreamToken: token }
    });

    if (!callSession) {
      logger.warn({ callSessionId }, 'Invalid token for Twilio media stream');
      this.ws.close(1008, 'Unauthorized');
      return;
    }

    const client = await clientService.getClientById(callSession.clientId);
    if (!client) {
      logger.error(
        { callSid: callSession.twilioCallSid, clientId: callSession.clientId },
        'Client not found for CallSession'
      );
      this.ws.close(1011, 'Client not found');
      return;
    }

    this.callSid = callSession.twilioCallSid;
    this.callSessionId = callSession.id;
    this.startedAt = callSession.startedAt;

    const childLogger = logger.child({
      module: 'TwilioMediaStreamHandler',
      callSid: this.callSid,
      clientId: client.id
    });

    this.realtime = new RealtimeSessionService({
      callSession,
      client,
      logger: childLogger,
      toolsRouter: toolsRouterService,
      elevenLabs: deepgramTtsService,
      sendAudioToCaller: async (audioMuLaw: Buffer) => {
        if (this.ws.readyState !== WebSocket.OPEN) {
          logger.warn({ callSid: this.callSid }, 'Cannot send audio to Twilio: WebSocket not open');
          return;
        }

        const frameSize = 160; // 20ms of 8kHz mu-law
        const currentPlaybackId = ++this.playbackId;
        this.speaking = true;
        logger.debug(
          {
            callSid: this.callSid,
            streamSid: this.streamSid,
            totalBytes: audioMuLaw.length
          },
          'Streaming TTS audio back to Twilio'
        );

        const startTime = Date.now();
        let frameIndex = 0;

        for (let offset = 0; offset < audioMuLaw.length; offset += frameSize) {
          if (this.playbackId !== currentPlaybackId) {
            logger.debug({ callSid: this.callSid, streamSid: this.streamSid }, 'TTS interrupted');
            break;
          }

          const targetTime = startTime + frameIndex * 20;
          const delay = targetTime - Date.now();
          if (delay > 0) {
            await sleep(delay);
          }
          if (this.playbackId !== currentPlaybackId) break;

          const chunk = audioMuLaw.subarray(offset, Math.min(offset + frameSize, audioMuLaw.length));
          const message = {
            event: 'media',
            streamSid: this.streamSid ?? undefined,
            media: {
              payload: chunk.toString('base64')
            }
          };

          try {
            this.ws.send(JSON.stringify(message));
          } catch (err) {
            logger.error(
              { err, callSid: this.callSid, streamSid: this.streamSid },
              'Failed sending media chunk to Twilio'
            );
            break;
          }
          frameIndex += 1;
        }

        if (this.playbackId === currentPlaybackId) {
          this.speaking = false;
        }
      }
    });

    this.initOk = true;
  }

  private async handleMessage(raw: RawData) {
    if (this.ended) return;

    let event: TwilioMediaStreamEvent;
    try {
      event = JSON.parse(raw.toString());
    } catch (err) {
      logger.error({ err }, 'Failed to parse Twilio media stream event');
      return;
    }

    switch (event.event) {
      case 'connected':
        break;
      case 'start':
        await this.handleStart(event as TwilioMediaStreamStartEvent);
        break;
      case 'media':
        if (!this.initOk) return;
        if (this.realtime && (event as TwilioMediaStreamMediaEvent).media?.payload) {
          const payload = (event as TwilioMediaStreamMediaEvent).media?.payload as string;
          this.handleBargeIn(payload);
          this.realtime.sendAudioFromCaller(payload);
        }
        break;
      case 'stop':
        await this.finishIfNeeded('completed');
        break;
      default:
        break;
    }
  }

  private async handleStart(event: TwilioMediaStreamStartEvent) {
    this.streamSid = event.streamSid ?? event.start?.streamSid ?? this.streamSid;
    this.callSid = event.start?.callSid ?? this.callSid;

    if (!this.initOk) {
      const customParameters = event.start?.customParameters ?? {};
      await this.initialize(
        this.urlCallSessionId ?? customParameters.callSessionId ?? null,
        this.urlToken ?? customParameters.token ?? null
      );
      if (!this.initOk) return;
    }

    logger.info({ callSid: this.callSid, streamSid: this.streamSid }, 'Twilio media stream started');

    if (this.realtime) {
      this.realtime.connect();
    }
  }

  private handleBargeIn(muLawBase64: string) {
    const shouldInterrupt = this.bargeInDetector.shouldInterrupt(muLawBase64, this.speaking);
    if (!shouldInterrupt) return;
    this.playbackId += 1;
    this.speaking = false;
    if (this.streamSid && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ event: 'clear', streamSid: this.streamSid }));
    }
  }

  private async finishIfNeeded(status: 'completed' | 'failed') {
    if (this.ended) return;
    this.ended = true;

    if (this.callSid) {
      try {
        await usageService.finishCallSession(this.callSid, status);
      } catch (err) {
        logger.error({ err, callSid: this.callSid }, 'Failed to finish call session on end');
      }
    }

    this.logCostsIfPossible();

    if (this.realtime) {
      await this.realtime.close();
    }

    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
  }

  private logCostsIfPossible() {
    if (!this.startedAt) return;
    if (!this.realtime) return;

    const usage = this.realtime.getUsageSnapshot();
    const seconds = diffInSecondsCeil(this.startedAt, new Date());
    const billedSeconds = Math.ceil(seconds / 60) * 60;
    const billedMinutes = billedSeconds / 60;

    const openaiCost =
      (usage.inputTokens / 1000) * env.OPENAI_INPUT_COST_PER_1K +
      (usage.outputTokens / 1000) * env.OPENAI_OUTPUT_COST_PER_1K;
    const deepgramCost = (usage.ttsChars / 1000) * env.DEEPGRAM_TTS_COST_PER_1K_CHARS;
    const twilioCost = billedMinutes * env.TWILIO_COST_PER_MINUTE;
    const totalCost = openaiCost + deepgramCost + twilioCost;
    const costPerMinute = billedMinutes > 0 ? totalCost / billedMinutes : 0;

    logger.info(
      {
        callSid: this.callSid,
        callSessionId: this.callSessionId,
        billedMinutes,
        costs: {
          openai: openaiCost,
          deepgram: deepgramCost,
          twilio: twilioCost,
          total: totalCost,
          perMinute: costPerMinute
        },
        usage
      },
      'Call cost summary'
    );
  }
}

export function initTwilioMediaStreamServer(wss: WebSocketServer) {
  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    logger.info('New Twilio media WebSocket connection');
    // eslint-disable-next-line no-new
    new TwilioMediaStreamHandler(ws, req);
  });

  logger.info('Twilio media WebSocket server initialized at /twilio/media-stream');
}
