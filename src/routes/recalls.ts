// src/routes/recalls.ts
import { Router } from 'express';
import { prisma } from '../config/db';
import { requireAuth, type AuthedRequest } from '../middleware/auth';

const router = Router();

function sortLeadItems(leads: Array<{
  id: string;
  capturedName: string | null;
  capturedPhone: string | null;
  capturedEmail: string | null;
  capturedReason: string | null;
  preferredContactTime: string | null;
  rawSummary: string | null;
  extraFields: unknown;
  createdAt: Date;
}>) {
  return leads
    .map((lead) => {
      const preferredTime = lead.preferredContactTime;
      const parsedPreferred = preferredTime ? Date.parse(preferredTime) : NaN;
      return {
        id: lead.id,
        capturedName: lead.capturedName,
        capturedPhone: lead.capturedPhone,
        capturedEmail: lead.capturedEmail,
        capturedReason: lead.capturedReason,
        preferredContactTime: lead.preferredContactTime,
        rawSummary: lead.rawSummary,
        extraFields: lead.extraFields,
        createdAt: lead.createdAt,
        urgencySort: Number.isNaN(parsedPreferred) ? null : parsedPreferred
      };
    })
    .sort((a, b) => {
      if (a.urgencySort !== null && b.urgencySort !== null) {
        return a.urgencySort - b.urgencySort;
      }
      if (a.urgencySort !== null) return -1;
      if (b.urgencySort !== null) return 1;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    })
    .map(({ urgencySort, ...rest }) => rest);
}

router.get('/api/recalls', requireAuth, async (req, res) => {
  const auth = (req as AuthedRequest).auth;

  const client = await prisma.client.findUnique({
    where: { id: auth.clientId }
  });

  if (!client) {
    return res.status(404).json({ error: 'Client not found' });
  }

  const leads = await prisma.intakeLead.findMany({
    where: {
      clientId: client.id,
      calledAt: null
    },
    orderBy: {
      createdAt: 'asc'
    }
  });

  return res.json({
    client: {
      id: client.id,
      name: client.name
    },
    items: sortLeadItems(leads)
  });
});

router.post('/api/recalls/:leadId/called', requireAuth, async (req, res) => {
  const auth = (req as AuthedRequest).auth;
  const { leadId } = req.params;
  if (!leadId) {
    return res.status(400).json({ error: 'Missing leadId' });
  }

  const lead = await prisma.intakeLead.findFirst({
    where: {
      id: leadId,
      clientId: auth.clientId,
      calledAt: null
    }
  });

  if (!lead) {
    return res.status(404).json({ error: 'Lead not found' });
  }

  const updated = await prisma.intakeLead.update({
    where: { id: lead.id },
    data: { calledAt: new Date() }
  });

  return res.json({ ok: true, calledAt: updated.calledAt });
});

export default router;
