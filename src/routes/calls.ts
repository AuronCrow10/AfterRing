// src/routes/calls.ts
import { Router } from 'express';
import { prisma } from '../config/db';
import { env } from '../config/env';
import { requireAuth, type AuthedRequest } from '../middleware/auth';
import { rateLimit } from '../middleware/rate-limit';
import { normalizePhoneE164 } from '../utils/telephony';

const router = Router();

const browserIntentLimiter = rateLimit({
  name: 'browser-call-intent',
  windowMs: 60 * 60 * 1000,
  max: 20,
  key: 'authOrIp'
});

router.post('/api/calls/browser-intent', requireAuth, browserIntentLimiter, async (req, res) => {
  const auth = (req as AuthedRequest).auth;
  const toNumber = normalizePhoneE164(String(req.body?.toNumber || env.TWILIO_INBOUND_NUMBER));
  if (!toNumber) {
    return res.status(400).json({ error: 'Missing destination number' });
  }

  await prisma.clientNumber.upsert({
    where: {
      clientId_twilioPhoneNumber: {
        clientId: auth.clientId,
        twilioPhoneNumber: toNumber
      }
    },
    update: {},
    create: {
      clientId: auth.clientId,
      twilioPhoneNumber: toNumber,
      description: 'Browser call destination'
    }
  });

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const intent = await prisma.browserCallIntent.create({
    data: {
      clientId: auth.clientId,
      userId: auth.sub,
      toNumber,
      expiresAt
    }
  });

  return res.json({
    id: intent.id,
    toNumber: intent.toNumber,
    expiresAt: intent.expiresAt
  });
});

export default router;
