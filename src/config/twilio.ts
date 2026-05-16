// src/config/twilio.ts
import crypto from 'crypto';
import type { Request } from 'express';
import axios from 'axios';
import { env } from './env';
import logger from './logger';

const SIGNATURE_HEADER = 'x-twilio-signature';

function base64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function getWebhookUrl(req: Request): string {
  const base = new URL(env.PUBLIC_BASE_URL);
  return `${base.origin}${req.originalUrl}`;
}

export function validateTwilioSignature(req: Request): boolean {
  const signature = req.header(SIGNATURE_HEADER);
  if (!signature) {
    logger.warn('Missing Twilio signature header');
    return false;
  }

  const params = req.body && typeof req.body === 'object' ? req.body : {};
  const sortedKeys = Object.keys(params).sort();
  const data = sortedKeys.reduce((acc, key) => `${acc}${key}${params[key] ?? ''}`, getWebhookUrl(req));
  const expected = crypto
    .createHmac('sha1', env.TWILIO_AUTH_TOKEN)
    .update(data)
    .digest('base64');

  try {
    const expectedBuffer = Buffer.from(expected);
    const receivedBuffer = Buffer.from(signature);
    if (expectedBuffer.length !== receivedBuffer.length) return false;
    return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
  } catch (err) {
    logger.error({ err }, 'Failed verifying Twilio signature');
    return false;
  }
}

export function shouldVerifyTwilioWebhook(req: Request): boolean {
  if (req.header(SIGNATURE_HEADER)) return true;
  return env.NODE_ENV === 'production';
}

export function createVoiceAccessToken(identity: string): string {
  const now = Math.floor(Date.now() / 1000);
  const ttlSeconds = 60 * 60;
  const header = {
    typ: 'JWT',
    alg: 'HS256',
    cty: 'twilio-fpa;v=1'
  };
  const payload = {
    jti: `${env.TWILIO_API_KEY_SID}-${now}`,
    iss: env.TWILIO_API_KEY_SID,
    sub: env.TWILIO_ACCOUNT_SID,
    exp: now + ttlSeconds,
    grants: {
      identity,
      voice: {
        outgoing: {
          application_sid: env.TWILIO_TWIML_APP_SID
        },
        incoming: {
          allow: true
        }
      }
    }
  };

  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const unsigned = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createHmac('sha256', env.TWILIO_API_KEY_SECRET)
    .update(unsigned)
    .digest();

  return `${unsigned}.${base64Url(signature)}`;
}

export async function completeTwilioCall(callSid: string): Promise<void> {
  try {
    await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
        env.TWILIO_ACCOUNT_SID
      )}/Calls/${encodeURIComponent(callSid)}.json`,
      new URLSearchParams({ Status: 'completed' }),
      {
        auth: {
          username: env.TWILIO_ACCOUNT_SID,
          password: env.TWILIO_AUTH_TOKEN
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 10000
      }
    );
  } catch (err) {
    logger.error({ err, callSid }, 'Twilio call completion failed');
    throw err;
  }
}
