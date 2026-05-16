// src/routes/auth.ts
import { Router } from 'express';
import { prisma } from '../config/db';
import { env } from '../config/env';
import { normalizePhoneE164 } from '../utils/telephony';
import { authService } from '../services/auth.service';
import { clearAuthCookie, getAuthFromRequest, setAuthCookie } from '../middleware/auth';
import { rateLimit } from '../middleware/rate-limit';

const router = Router();

const loginLimiter = rateLimit({
  name: 'auth-login',
  windowMs: 15 * 60 * 1000,
  max: 20
});

const registrationLimiter = rateLimit({
  name: 'auth-registration',
  windowMs: 60 * 60 * 1000,
  max: 5
});

function normalizeEmail(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function getPassword(value: unknown): string {
  return String(value ?? '');
}

async function getOrCreateDefaultClient(name: string) {
  await prisma.plan.upsert({
    where: { code: 'PLAN_500' },
    update: {
      includedMinutes: 500,
      description: 'Piano base con 500 minuti al mese',
      active: true
    },
    create: {
      code: 'PLAN_500',
      includedMinutes: 500,
      description: 'Piano base con 500 minuti al mese',
      active: true
    }
  });

  let client = await prisma.client.findFirst({
    orderBy: { createdAt: 'asc' }
  });

  if (!client) {
    client = await prisma.client.create({
      data: {
        name,
        timezone: 'Europe/Rome',
        locale: env.INTAKE_DEFAULT_LOCALE,
        planCode: 'PLAN_500',
        planMinutesLimit: 500,
        hardLimit: true
      }
    });
  }

  const twilioPhoneNumber = normalizePhoneE164(env.TWILIO_INBOUND_NUMBER);
  await prisma.clientNumber.upsert({
    where: {
      clientId_twilioPhoneNumber: {
        clientId: client.id,
        twilioPhoneNumber
      }
    },
    update: {
      description: 'Numero principale'
    },
    create: {
      clientId: client.id,
      twilioPhoneNumber,
      description: 'Numero principale'
    }
  });

  return client;
}

async function ensureBasePlan() {
  await prisma.plan.upsert({
    where: { code: 'PLAN_500' },
    update: {
      includedMinutes: 500,
      description: 'Piano base con 500 minuti al mese',
      active: true
    },
    create: {
      code: 'PLAN_500',
      includedMinutes: 500,
      description: 'Piano base con 500 minuti al mese',
      active: true
    }
  });
}

async function createTenantClient(name: string) {
  await ensureBasePlan();
  return prisma.client.create({
    data: {
      name,
      timezone: 'Europe/Rome',
      locale: env.INTAKE_DEFAULT_LOCALE,
      planCode: 'PLAN_500',
      planMinutesLimit: 500,
      hardLimit: true
    }
  });
}

function sendLoginResponse(res: any, user: {
  id: string;
  clientId: string;
  email: string;
  role: string;
}, client: {
  id: string;
  name: string;
}) {
  const token = authService.signSessionToken({
    userId: user.id,
    clientId: user.clientId,
    email: user.email,
    role: user.role
  });
  setAuthCookie(res, token);

  return res.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      role: user.role
    },
    client: {
      id: client.id,
      name: client.name
    }
  });
}

router.get('/api/auth/me', async (req, res) => {
  const auth = getAuthFromRequest(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const user = await prisma.user.findUnique({
    where: { id: auth.sub },
    include: { client: true }
  });

  if (!user) {
    clearAuthCookie(res);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  return res.json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role
    },
    client: {
      id: user.client.id,
      name: user.client.name,
      locale: user.client.locale,
      timezone: user.client.timezone
    }
  });
});

router.post('/api/auth/login', loginLimiter, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = getPassword(req.body?.password);
  if (!email || !password) {
    return res.status(400).json({ error: 'Missing email or password' });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { client: true }
  });

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const ok = await authService.verifyPassword(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  return sendLoginResponse(res, user, user.client);
});

router.post('/api/auth/register', registrationLimiter, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = getPassword(req.body?.password);
  const clientName = String(req.body?.clientName ?? '').trim();
  if (!email || password.length < 8 || !clientName) {
    return res.status(400).json({ error: 'Tenant name, email, and an 8+ character password are required' });
  }

  const existing = await prisma.user.findUnique({
    where: { email }
  });

  if (existing) {
    return res.status(409).json({ error: 'An account already exists for this email' });
  }

  const client = await createTenantClient(clientName);
  const passwordHash = await authService.hashPassword(password);
  const user = await prisma.user.create({
    data: {
      clientId: client.id,
      email,
      passwordHash,
      role: 'owner'
    }
  });

  return sendLoginResponse(res, user, client);
});

router.post('/api/auth/logout', (_req, res) => {
  clearAuthCookie(res);
  return res.json({ ok: true });
});

router.post('/api/auth/bootstrap', registrationLimiter, async (req, res) => {
  const existingUsers = await prisma.user.count();
  if (existingUsers > 0) {
    return res.status(409).json({ error: 'Bootstrap is already completed' });
  }

  const email = normalizeEmail(req.body?.email);
  const password = getPassword(req.body?.password);
  const clientName = String(req.body?.clientName ?? 'Demo Tenant').trim() || 'Demo Tenant';
  if (!email || password.length < 8) {
    return res.status(400).json({ error: 'Email and an 8+ character password are required' });
  }

  const client = await getOrCreateDefaultClient(clientName);
  const passwordHash = await authService.hashPassword(password);
  const user = await prisma.user.create({
    data: {
      clientId: client.id,
      email,
      passwordHash,
      role: 'owner'
    }
  });

  const token = authService.signSessionToken({
    userId: user.id,
    clientId: user.clientId,
    email: user.email,
    role: user.role
  });
  setAuthCookie(res, token);

  return res.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      role: user.role
    },
    client: {
      id: client.id,
      name: client.name
    }
  });
});

export default router;
