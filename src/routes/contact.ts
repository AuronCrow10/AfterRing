// src/routes/contact.ts
import { Router } from 'express';
import { emailService } from '../services/email.service';
import { rateLimit } from '../middleware/rate-limit';

const router = Router();

const contactLimiter = rateLimit({
  name: 'contact',
  windowMs: 60 * 60 * 1000,
  max: 10
});

router.post('/api/contact', contactLimiter, async (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  const email = String(req.body?.email ?? '').trim();
  const company = String(req.body?.company ?? '').trim();
  const phone = String(req.body?.phone ?? '').trim();
  const message = String(req.body?.message ?? '').trim();
  const locale = String(req.body?.locale ?? '').trim();

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  await emailService.sendContactEmail({
    name,
    email,
    company: company || undefined,
    phone: phone || undefined,
    message,
    locale: locale || undefined
  });

  return res.json({ ok: true });
});

export default router;
