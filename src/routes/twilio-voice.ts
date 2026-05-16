// src/routes/twilio-voice.ts
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import logger from '../config/logger';
import { validateTwilioSignature, shouldVerifyTwilioWebhook } from '../config/twilio';
import type { TwilioVoiceWebhookBody } from '../types/twilio';
import { normalizePhoneE164, buildMediaStreamUrl } from '../utils/telephony';
import { clientService } from '../services/client.service';
import { planService } from '../services/plan.service';
import { usageService } from '../services/usage.service';
import { prisma } from '../config/db';

const router = Router();

function twiml(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;
}

function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function sendTwiml(res: any, body: string) {
  res.type('text/xml').send(twiml(body));
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

async function resolveBrowserIntent(intentId: string, toNumber: string) {
  const now = new Date();
  const intent = await prisma.browserCallIntent.findFirst({
    where: {
      id: intentId,
      usedAt: null,
      expiresAt: {
        gt: now
      }
    },
    include: {
      client: true
    }
  });

  if (!intent) return null;

  const clientNumber = await prisma.clientNumber.upsert({
    where: {
      clientId_twilioPhoneNumber: {
        clientId: intent.clientId,
        twilioPhoneNumber: toNumber
      }
    },
    update: {},
    create: {
      clientId: intent.clientId,
      twilioPhoneNumber: toNumber,
      description: 'Browser call destination'
    }
  });

  await prisma.browserCallIntent.update({
    where: { id: intent.id },
    data: { usedAt: now }
  });

  return {
    client: intent.client,
    clientNumber
  };
}

async function handleVoiceWebhook(body: TwilioVoiceWebhookBody) {
  const callSid = getString(body.CallSid);
  if (!callSid) {
    logger.warn('Twilio voice webhook missing CallSid');
    return { action: 'reject' as const };
  }

  const to = normalizePhoneE164(getString(body.To));
  const from = getString(body.From).startsWith('client:')
    ? getString(body.From)
    : normalizePhoneE164(getString(body.From));

  if (!to) {
    logger.warn({ callSid }, 'Missing destination number in Twilio webhook');
    return { action: 'reject' as const };
  }

  const intentId = getString(body.intentId);
  const mapping = intentId
    ? await resolveBrowserIntent(intentId, to)
    : await clientService.findClientByTwilioNumber(to);

  if (!mapping) {
    logger.warn({ callSid, to, intentId }, 'Client mapping not found for Twilio call');
    return { action: 'reject' as const };
  }

  const { client, clientNumber } = mapping;
  const planResult = await planService.checkClientPlanLimit(client.id, new Date());

  if (!planResult.allowed && planResult.hardLimit) {
    await usageService.markBlockedByPlan({
      clientId: client.id,
      clientNumberId: clientNumber.id,
      callSid,
      fromNumber: from,
      toNumber: to
    });
    return { action: 'reject' as const };
  }

  const existing = await usageService.getCallSessionByCallSid(callSid);
  let mediaStreamToken = existing?.mediaStreamToken ?? uuidv4();
  let session = existing;

  if (!session) {
    session = await usageService.startCallSession({
      clientId: client.id,
      clientNumberId: clientNumber.id,
      callSid,
      fromNumber: from,
      toNumber: to,
      mediaStreamToken
    });
  } else if (!session.mediaStreamToken) {
    session = await usageService.updateMediaStreamToken(session.id, mediaStreamToken);
  }

  const mediaStreamUrl = buildMediaStreamUrl();

  logger.info(
    {
      callSid,
      clientId: client.id,
      clientNumberId: clientNumber.id,
      callSessionId: session.id,
      from,
      to,
      mediaStreamUrl
    },
    'Starting Twilio media stream'
  );

  return {
    action: 'stream' as const,
    mediaStreamUrl,
    callSessionId: session.id,
    token: mediaStreamToken
  };
}

router.post('/voice', async (req, res) => {
  const shouldVerify = shouldVerifyTwilioWebhook(req);
  if (shouldVerify && !validateTwilioSignature(req)) {
    return res.status(403).send('Invalid signature');
  }

  try {
    const result = await handleVoiceWebhook(req.body as TwilioVoiceWebhookBody);
    if (result.action === 'stream') {
      return sendTwiml(
        res,
        [
          `<Connect><Stream url="${escapeXmlAttribute(result.mediaStreamUrl)}">`,
          `<Parameter name="callSessionId" value="${escapeXmlAttribute(result.callSessionId)}" />`,
          `<Parameter name="token" value="${escapeXmlAttribute(result.token)}" />`,
          '</Stream></Connect>'
        ].join('')
      );
    }
    return sendTwiml(res, '<Reject />');
  } catch (err) {
    logger.error({ err }, 'Failed handling Twilio voice webhook');
    return sendTwiml(res, '<Hangup />');
  }
});

router.post('/status', async (req, res) => {
  const shouldVerify = shouldVerifyTwilioWebhook(req);
  if (shouldVerify && !validateTwilioSignature(req)) {
    return res.status(403).send('Invalid signature');
  }

  const body = req.body as TwilioVoiceWebhookBody;
  const callSid = getString(body.CallSid);
  const status = getString(body.CallStatus);
  if (callSid && ['completed', 'busy', 'failed', 'no-answer', 'canceled'].includes(status)) {
    const finalStatus = status === 'failed' ? 'failed' : 'completed';
    await usageService.finishCallSession(callSid, finalStatus);
  }

  return res.sendStatus(204);
});

export default router;
