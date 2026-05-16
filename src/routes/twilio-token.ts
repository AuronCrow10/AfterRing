// src/routes/twilio-token.ts
import { Router } from 'express';
import { env } from '../config/env';
import { createVoiceAccessToken } from '../config/twilio';
import { generateUuid } from '../utils/uuid';
import { requireAuth, type AuthedRequest } from '../middleware/auth';
import { rateLimit } from '../middleware/rate-limit';

const router = Router();

const tokenLimiter = rateLimit({
  name: 'twilio-token',
  windowMs: 15 * 60 * 1000,
  max: 30,
  key: 'authOrIp'
});

router.get('/token', requireAuth, tokenLimiter, (req, res) => {
  const auth = (req as AuthedRequest).auth;
  const identity = `voice_ai_${auth.sub.replace(/-/g, '_')}_${generateUuid().replace(/-/g, '_')}`;
  const token = createVoiceAccessToken(identity);

  return res.json({
    token,
    identity,
    callerNumber: env.TWILIO_CALLER_ID,
    defaultDestination: env.TWILIO_INBOUND_NUMBER,
    clientId: auth.clientId
  });
});

export default router;
