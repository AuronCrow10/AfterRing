// src/services/realtime-session.service.ts
import WebSocket from 'ws';
import type { Client as DbClient, CallSession } from '@prisma/client';
import type pino from 'pino';
import { createRealtimeWebSocket } from '../config/openai-realtime';
import {
  defaultIntakeLocale,
  getAcknowledgementsForLocale,
  getInitialInstructionForLocale,
  getIntakePromptForLocale,
  intakeTools
} from '../config/conversation';
import type { ToolsRouterServiceType, ToolCallContext } from './tools-router.service';
import type { DeepgramTtsServiceType } from './deepgram-tts.service';
import loggerRoot from '../config/logger';
import type {
  RealtimeResponseDoneEvent,
  RealtimeResponseDoneFunctionCallItem
} from '../types/realtime';
import { env } from '../config/env';
import { completeTwilioCall } from '../config/twilio';
import { getIntakeFlowForClient } from './intake-config.service';

interface RealtimeSessionOptions {
  callSession: CallSession;
  client: DbClient;
  logger?: pino.Logger;
  toolsRouter: ToolsRouterServiceType;
  elevenLabs: DeepgramTtsServiceType;
  sendAudioToCaller: (audioMuLaw: Buffer) => Promise<void> | void;
}

export class RealtimeSessionService {
  private ws: WebSocket | null = null;
  private readonly callSession: CallSession;
  private readonly client: DbClient;
  private readonly log: pino.Logger;
  private readonly toolsRouter: ToolsRouterServiceType;
  private readonly tts: DeepgramTtsServiceType;
  private readonly sendAudioToCaller: (audioMuLaw: Buffer) => Promise<void> | void;

  private ready = false;
  private closed = false;
  private audioQueue: string[] = [];
  private textBuffers: Map<string, string> = new Map();
  private streamOffsets: Map<string, number> = new Map();
  private transcriptionBuffers: Map<string, string> = new Map();
  private lastUserTranscript = '';
  private phoneChunkDeadlineMs = 0;
  private phoneEntryActive = false;
  private lastPhoneChunkAtMs = 0;
  private leadSaved = false;
  private awaitingConfirmation = false;
  private ttsQueue: Array<{ text: string; locale: string; modelOverride?: string; checkEndCall: boolean }> = [];
  private ttsProcessing = false;
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private totalTokens = 0;
  private responseCount = 0;
  private totalTtsChars = 0;

  constructor(options: RealtimeSessionOptions) {
    this.callSession = options.callSession;
    this.client = options.client;
    this.toolsRouter = options.toolsRouter;
    this.tts = options.elevenLabs;
    this.sendAudioToCaller = options.sendAudioToCaller;
    this.log =
      options.logger ??
      loggerRoot.child({
        module: 'RealtimeSessionService',
        callSid: options.callSession.twilioCallSid,
        clientId: options.client.id
      });
  }

  connect(): void {
    if (this.ws) return;

    const ws = createRealtimeWebSocket();
    this.ws = ws;

    ws.on('open', () => {
      void this.handleOpen();
    });

    ws.on('message', (data: WebSocket.RawData) => {
      this.handleMessage(data);
    });

    ws.on('error', (err) => {
      this.log.error({ err }, 'Realtime WebSocket error');
    });

    ws.on('close', (code, reason) => {
      this.closed = true;
      this.log.info({ code, reason: reason.toString() }, 'Realtime WebSocket closed');
    });
  }

  private async handleOpen() {
    this.ready = true;
    this.log.info('Realtime session connected');

    const locale = this.client.locale || defaultIntakeLocale;
    const flow = await getIntakeFlowForClient(this.client.id, locale);
    const acknowledgements = getAcknowledgementsForLocale(locale);
    const currentTime = this.formatCurrentTimeContext();
    const intakePrompt = getIntakePromptForLocale(locale, flow.steps, currentTime);

    const combinedInstructions = `${intakePrompt}\n\nClient name: ${this.client.name}.\nLanguage: ${locale} (do not switch).\nAcknowledgement bank (use occasionally, 1-2 words): ${acknowledgements.join(
      ', '
    )}.\nKeep responses short, natural, and human.\nAllow brief pauses and avoid talking over the caller.`;

    const sessionUpdateEvent = {
      type: 'session.update',
      session: {
        type: 'realtime',
        model: env.OPENAI_REALTIME_MODEL,
        instructions: combinedInstructions,
        output_modalities: ['text'],
        audio: {
          input: {
            format: {
              type: 'audio/pcmu'
            },
            transcription: {
              model: 'gpt-4o-mini-transcribe',
              language: this.getTranscriptionLanguage(locale)
            },
            turn_detection: {
              type: 'server_vad',
              create_response: true,
              interrupt_response: true,
              silence_duration_ms: env.VAD_SILENCE_MS
            }
          }
        },
        tools: intakeTools,
        tool_choice: 'auto'
      } as any
    };

    this.sendEvent(sessionUpdateEvent);

    const initialResponseEvent = {
      type: 'response.create',
      response: {
        output_modalities: ['text'],
        instructions: getInitialInstructionForLocale(locale, this.client.name)
      }
    };

    this.sendEvent(initialResponseEvent);
    this.flushQueuedAudio();
  }

  private sendEvent(event: any) {
    if (!this.ws || this.closed) return;
    try {
      this.ws.send(JSON.stringify(event));
    } catch (err) {
      this.log.error({ err, eventType: event?.type }, 'Failed to send event to Realtime API');
    }
  }

  sendAudioFromCaller(base64MuLaw: string) {
    if (!this.ready) {
      this.audioQueue.push(base64MuLaw);
      return;
    }
    this.appendAudio(base64MuLaw);
  }

  private appendAudio(base64MuLaw: string) {
    const event = {
      type: 'input_audio_buffer.append',
      audio: base64MuLaw
    };
    this.sendEvent(event);
  }

  private flushQueuedAudio() {
    if (!this.ready) return;
    for (const payload of this.audioQueue) {
      this.appendAudio(payload);
    }
    this.audioQueue = [];
  }

  private handleMessage(raw: WebSocket.RawData) {
    let event: any;
    try {
      event = JSON.parse(raw.toString());
    } catch (err) {
      this.log.error({ err }, 'Failed to parse Realtime event');
      return;
    }

    if (
      typeof event.type === 'string' &&
      (event.type.startsWith('input_audio_transcription') ||
        event.type.startsWith('conversation.item.input_audio_transcription'))
    ) {
      this.handleTranscriptionEvent(event);
      return;
    }

    if (event.type === 'response.text.delta' || event.type === 'response.output_text.delta') {
      this.handleTextDelta(event);
      return;
    }

    switch (event.type) {
      case 'response.text.done':
      case 'response.output_text.done':
        void this.handleTextDone(event);
        break;
      case 'response.done':
        void this.handleResponseDone(event as RealtimeResponseDoneEvent);
        break;
      case 'error':
        this.log.error({ event }, 'Realtime error event');
        break;
      default:
        break;
    }
  }

  private handleTextDelta(event: any) {
    const responseId: string = event.response_id;
    const current = this.textBuffers.get(responseId) ?? '';
    const next = current + (event.delta ?? '');
    this.textBuffers.set(responseId, next);
    this.maybeStreamPartial(responseId);
  }

  private handleTranscriptionEvent(event: any) {
    const type = String(event.type || '');
    const itemId = event.item_id || event.id || event.response_id || 'default';
    if (type.endsWith('.delta') && typeof event.delta === 'string') {
      const current = this.transcriptionBuffers.get(itemId) ?? '';
      this.transcriptionBuffers.set(itemId, current + event.delta);
      return;
    }

    if (type.endsWith('.completed') || type.endsWith('.done') || type.endsWith('.final')) {
      const buffered = this.transcriptionBuffers.get(itemId) ?? '';
      this.transcriptionBuffers.delete(itemId);
      const text = event.transcript ?? event.text ?? buffered;
      const trimmed = String(text || '').trim();
      if (!trimmed) return;
      this.lastUserTranscript = trimmed;

      if (this.isPhoneChunk(trimmed)) {
        this.phoneChunkDeadlineMs = Date.now() + env.PHONE_CHUNK_DEADLINE_MS;
        this.phoneEntryActive = true;
        this.lastPhoneChunkAtMs = Date.now();
      } else if (this.isLikelyFullPhone(trimmed)) {
        this.phoneChunkDeadlineMs = 0;
        this.phoneEntryActive = false;
      } else if (this.phoneEntryActive) {
        if (Date.now() - this.lastPhoneChunkAtMs > env.PHONE_CHUNK_DEADLINE_MS) {
          this.phoneEntryActive = false;
        }
      }

      const locale = this.client.locale || defaultIntakeLocale;
      const confirmation = this.getYesNoIntent(trimmed, locale);
      if (this.awaitingConfirmation && confirmation) {
        this.awaitingConfirmation = false;
        const instructions =
          confirmation === 'yes'
            ? 'The caller confirmed. If all required fields are collected, call save_intake_lead. Otherwise ask only the missing fields.'
            : 'The caller said no. Ask what is incorrect and let them correct it.';
        this.sendEvent({
          type: 'response.create',
          response: {
            output_modalities: ['text'],
            instructions
          }
        });
      }
    }
  }

  private async handleTextDone(event: any) {
    const responseId: string = event.response_id;
    const full = this.textBuffers.get(responseId) ?? event.text ?? '';
    this.textBuffers.delete(responseId);
    const streamedOffset = this.streamOffsets.get(responseId) ?? 0;
    this.streamOffsets.delete(responseId);

    const trimmed = full.trim();
    if (!trimmed) return;
    const locale = this.client.locale || defaultIntakeLocale;
    const remaining = trimmed.slice(streamedOffset).trim();
    if (remaining) {
      await this.enqueueAssistantText(remaining, locale, true);
    }
  }

  private async handleResponseDone(event: RealtimeResponseDoneEvent) {
    this.maybeLogUsage(event);
    const output = event.response.output || [];
    for (const item of output) {
      if ((item as RealtimeResponseDoneFunctionCallItem).type === 'function_call') {
        const fnItem = item as RealtimeResponseDoneFunctionCallItem;
        await this.handleFunctionCall(fnItem);
      }
    }
  }

  private shouldSuppressShortAck(text: string): boolean {
    if (!this.phoneChunkDeadlineMs || Date.now() > this.phoneChunkDeadlineMs) {
      return false;
    }
    const normalized = text.trim().toLowerCase();
    if (normalized.length > 40) {
      return false;
    }
    const locale = this.client.locale || defaultIntakeLocale;
    const ack = this.getAckWords(locale);
    return ack.some((word) => normalized.startsWith(word));
  }

  private maybeStreamPartial(responseId: string) {
    const full = this.textBuffers.get(responseId) ?? '';
    if (!full) return;
    const locale = this.client.locale || defaultIntakeLocale;
    const emitted = this.streamOffsets.get(responseId) ?? 0;
    if (emitted >= full.length) return;
    const pending = full.slice(emitted);

    const minChunkChars = 40;
    const sentenceMatch = this.findSentenceBoundary(pending, minChunkChars);
    if (!sentenceMatch) return;

    const chunk = sentenceMatch.chunk.trim();
    if (!chunk) return;

    void this.enqueueAssistantText(chunk, locale, false);
    this.streamOffsets.set(responseId, emitted + sentenceMatch.length);
  }

  private findSentenceBoundary(text: string, minChars: number): { chunk: string; length: number } | null {
    const regex = /[.!?]+[\s\r\n]/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const endIndex = match.index + match[0].length;
      const candidate = text.slice(0, endIndex);
      if (candidate.trim().length >= minChars) {
        return { chunk: candidate, length: endIndex };
      }
    }
    return null;
  }

  private async enqueueAssistantText(
    text: string,
    locale: string,
    checkEndCall: boolean
  ): Promise<void> {
    const sanitized = this.sanitizeAssistantText(text, locale);
    if (!sanitized) return;

    if (this.isPhoneEntryActive() && this.shouldSuppressDuringPhoneEntry(sanitized)) {
      return;
    }

    if (this.shouldSuppressShortAck(sanitized)) {
      return;
    }

    this.totalTtsChars += sanitized.length;
    this.awaitingConfirmation = this.isConfirmationPrompt(sanitized, locale);
    const modelOverride = this.client.elevenLabsVoiceId || undefined;
    this.ttsQueue.push({ text: sanitized, locale, modelOverride, checkEndCall });
    if (!this.ttsProcessing) {
      void this.processTtsQueue();
    }
  }

  private async processTtsQueue(): Promise<void> {
    this.ttsProcessing = true;
    while (this.ttsQueue.length > 0) {
      const item = this.ttsQueue.shift();
      if (!item) break;
      try {
        const audioMuLaw = await this.tts.synthesizeToMuLaw(
          item.text,
          item.locale,
          item.modelOverride
        );
        await this.sendAudioToCaller(audioMuLaw);
        if (item.checkEndCall && this.leadSaved && this.isClosingUtterance(item.text, item.locale)) {
          await this.endCall();
        }
      } catch (err) {
        this.log.error({ err }, 'Failed to synthesize or send TTS audio');
      }
    }
    this.ttsProcessing = false;
  }

  private getAckWords(locale: string): string[] {
    const key = (locale || defaultIntakeLocale).toLowerCase().slice(0, 2);
    if (key === 'it') return ['ok', 'capito', 'perfetto', 'grazie'];
    if (key === 'es') return ['ok', 'vale', 'entendido', 'gracias'];
    if (key === 'fr') return ['ok', "d'accord", 'compris', 'merci'];
    if (key === 'de') return ['ok', 'alles klar', 'verstanden', 'danke'];
    return ['ok', 'okay', 'thanks', 'got it', 'perfect'];
  }

  private isPhoneChunk(text: string): boolean {
    const digits = text.replace(/\D/g, '');
    return digits.length >= 2 && digits.length <= 6 && text.length <= 20;
  }

  private isLikelyFullPhone(text: string): boolean {
    const digits = text.replace(/\D/g, '');
    return digits.length >= 8;
  }

  private formatCurrentTimeContext(): string {
    const now = new Date();
    const offsetMinutes = -now.getTimezoneOffset();
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const absMinutes = Math.abs(offsetMinutes);
    const offsetHours = String(Math.floor(absMinutes / 60)).padStart(2, '0');
    const offsetMins = String(absMinutes % 60).padStart(2, '0');
    const offset = `${sign}${offsetHours}:${offsetMins}`;
    const iso = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .replace('Z', offset);
    const label = env.ASSISTANT_TIMEZONE_LABEL || 'local';
    return `${iso} (${label})`;
  }

  private isPhoneEntryActive(): boolean {
    if (!this.phoneEntryActive) return false;
    if (Date.now() - this.lastPhoneChunkAtMs > env.PHONE_ENTRY_TIMEOUT_MS) {
      this.phoneEntryActive = false;
      return false;
    }
    return true;
  }

  private shouldSuppressDuringPhoneEntry(text: string): boolean {
    const normalized = text.trim().toLowerCase();
    const hasDigits = /\d/.test(normalized);
    if (!hasDigits && normalized.length <= 40) {
      return true;
    }
    const locale = this.client.locale || defaultIntakeLocale;
    const ack = this.getAckWords(locale);
    return ack.some((word) => normalized.startsWith(word));
  }

  private getTranscriptionLanguage(locale: string): string | undefined {
    const key = (locale || defaultIntakeLocale).toLowerCase().slice(0, 2);
    if (key === 'it') return 'it';
    if (key === 'es') return 'es';
    if (key === 'fr') return 'fr';
    if (key === 'de') return 'de';
    return 'en';
  }

  private sanitizeAssistantText(text: string, locale: string): string {
    const lowered = text.toLowerCase();
    const key = (locale || defaultIntakeLocale).toLowerCase().slice(0, 2);
    const bannedByLocale: Record<string, string[]> = {
      it: ['sto chiudendo la chiamata', 'chiudo la chiamata', 'sto terminando la chiamata'],
      en: ["i'm closing the call", 'i am closing the call', 'ending the call now'],
      es: ['estoy cerrando la llamada', 'cierro la llamada'],
      fr: ["je termine l'appel", "je clos l'appel"],
      de: ['ich beende den anruf', 'ich schliesse den anruf']
    };
    const banned = bannedByLocale[key] ?? bannedByLocale.en;
    let sanitized = text;
    for (const phrase of banned) {
      if (lowered.includes(phrase)) {
        const regex = new RegExp(`\\s*${phrase.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}[\\s\\.!?]*`, 'ig');
        sanitized = sanitized.replace(regex, ' ').trim();
      }
    }
    return sanitized.trim();
  }

  private isConfirmationPrompt(text: string, locale: string): boolean {
    const lowered = text.toLowerCase();
    const key = (locale || defaultIntakeLocale).toLowerCase().slice(0, 2);
    const patternsByLocale: Record<string, RegExp[]> = {
      it: [
        /confermi/,
        /e'? corretto/,
        /puoi dire ['"]?si/,
        /puoi confermare/
      ],
      en: [
        /confirm/,
        /is that correct/,
        /can you confirm/,
        /you can say ['"]?yes/
      ],
      es: [
        /confirmas/,
        /es correcto/,
        /puedes confirmar/,
        /puedes decir ['"]?si/
      ],
      fr: [
        /confirmez/,
        /c'est correct/,
        /pouvez confirmer/,
        /vous pouvez dire ['"]?oui/
      ],
      de: [
        /bestaetigen/,
        /ist das korrekt/,
        /koennen sie bestaetigen/,
        /sie koennen ['"]?ja sagen/
      ]
    };
    const patterns = patternsByLocale[key] ?? patternsByLocale.en;
    return patterns.some((pattern) => pattern.test(lowered));
  }

  private getYesNoIntent(text: string, locale: string): 'yes' | 'no' | null {
    const normalized = text.trim().toLowerCase();
    const key = (locale || defaultIntakeLocale).toLowerCase().slice(0, 2);
    const yesByLocale: Record<string, string[]> = {
      it: ['si', 'ok', 'va bene', 'certo', 'corretto', 'esatto'],
      en: ['yes', 'ok', 'okay', 'correct', 'right'],
      es: ['si', 'ok', 'vale', 'correcto'],
      fr: ['oui', 'ok', "d'accord", 'correct'],
      de: ['ja', 'ok', 'stimmt', 'korrekt']
    };
    const noByLocale: Record<string, string[]> = {
      it: ['no', 'non e corretto', 'sbagliato', 'non proprio'],
      en: ['no', 'not correct', 'wrong'],
      es: ['no', 'incorrecto', 'mal'],
      fr: ['non', 'pas correct', 'faux'],
      de: ['nein', 'nicht korrekt', 'falsch']
    };
    const yesWords = yesByLocale[key] ?? yesByLocale.en;
    const noWords = noByLocale[key] ?? noByLocale.en;
    if (yesWords.some((word) => normalized === word)) return 'yes';
    if (noWords.some((word) => normalized === word)) return 'no';
    return null;
  }

  private async handleFunctionCall(item: RealtimeResponseDoneFunctionCallItem) {
    const name = item.name;
    const argsJson = item.arguments ?? '{}';
    const callId = item.call_id;

    const context: ToolCallContext = {
      client: this.client,
      callSession: this.callSession
    };

    let output: any;
    this.log.info(
      {
        functionName: name,
        leadSaved: this.leadSaved,
        callSessionId: this.callSession.id
      },
      'Realtime function call requested'
    );

    if (name === 'end_call' && !this.leadSaved) {
      this.log.warn(
        { callSessionId: this.callSession.id },
        'Ignored premature end_call function call before lead was saved'
      );
      output = {
        ok: false,
        error: 'lead_not_saved',
        instruction: 'Continue the intake. Ask the next missing required field and do not end the call.'
      };
    } else {
      try {
        output = await this.toolsRouter.handleFunctionCall(name, argsJson, context);
      } catch (err) {
        this.log.error({ err, functionName: name }, 'Tool execution failed');
        output = { error: 'Tool execution failed' };
      }
    }

    if (name === 'save_intake_lead') {
      this.leadSaved = output?.ok === true;
    }

    const createItemEvent = {
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output: JSON.stringify(output)
      }
    };

    this.sendEvent(createItemEvent);

    const responseCreateEvent = {
      type: 'response.create',
      response: name === 'end_call' && output?.error === 'lead_not_saved'
        ? {
            output_modalities: ['text'],
            instructions:
              'The call is not complete. Continue the intake and ask only the next missing required field. Do not say goodbye and do not call end_call.'
          }
        : {
            output_modalities: ['text']
          }
    };

    this.sendEvent(responseCreateEvent);
  }

  private async endCall() {
    const callSid = this.callSession.twilioCallSid;
    try {
      await completeTwilioCall(callSid);
      this.log.info({ callSid }, 'Call ended after closing');
    } catch (err) {
      this.log.error({ err, callSid }, 'Failed to end call after closing');
    }
  }

  private isClosingUtterance(text: string, locale: string): boolean {
    const lower = text.toLowerCase();
    const key = (locale || defaultIntakeLocale).toLowerCase().slice(0, 2);
    const phrasesByLocale: Record<string, string[]> = {
      it: ['arrivederci', 'grazie', 'la richiameremo', 'la richiamera', 'buona giornata'],
      en: ['goodbye', 'thank you', 'we will call you back', 'have a nice day'],
      es: ['adios', 'gracias', 'le llamaremos', 'buen dia'],
      fr: ['au revoir', 'merci', 'nous vous rappellerons', 'bonne journee'],
      de: ['auf wiedersehen', 'danke', 'wir rufen sie zurueck', 'schoenen tag']
    };
    const phrases = phrasesByLocale[key] ?? phrasesByLocale.en;
    return phrases.some((phrase) => lower.includes(phrase));
  }

  getUsageSnapshot() {
    return {
      responses: this.responseCount,
      inputTokens: this.totalInputTokens,
      outputTokens: this.totalOutputTokens,
      totalTokens: this.totalTokens,
      ttsChars: this.totalTtsChars
    };
  }

  private maybeLogUsage(event: RealtimeResponseDoneEvent) {
    const usage = (event as any)?.response?.usage;
    if (!usage) return;
    const inputTokens = usage.input_tokens ?? usage.input_tokens_total ?? 0;
    const outputTokens = usage.output_tokens ?? usage.output_tokens_total ?? 0;
    const totalTokens = usage.total_tokens ?? inputTokens + outputTokens;
    if (inputTokens === 0 && outputTokens === 0 && totalTokens === 0) return;

    this.responseCount += 1;
    this.totalInputTokens += inputTokens;
    this.totalOutputTokens += outputTokens;
    this.totalTokens += totalTokens;
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
  }
}

