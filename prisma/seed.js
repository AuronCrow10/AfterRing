const crypto = require('crypto');
const { promisify } = require('util');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const scryptAsync = promisify(crypto.scrypt);

const DEMO_EMAIL = process.env.DEMO_EMAIL || 'demo@afterring.it';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'ChangeMe123!';
const DEMO_CLIENT_NAME = process.env.DEMO_CLIENT_NAME || 'Studio Legale Demo';
const TWILIO_INBOUND_NUMBER = process.env.TWILIO_INBOUND_NUMBER || '';

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await scryptAsync(password, salt, 64);
  return `scrypt:${salt}:${derived.toString('hex')}`;
}

async function main() {
  if (!TWILIO_INBOUND_NUMBER || !TWILIO_INBOUND_NUMBER.startsWith('+')) {
    throw new Error('Please set TWILIO_INBOUND_NUMBER in .env to your real Twilio number in E.164 format.');
  }

  const plans = [
    {
      code: 'PLAN_500',
      includedMinutes: 500,
      description: 'Piano base con 500 minuti al mese',
      active: true
    },
    {
      code: 'PLAN_1000',
      includedMinutes: 1000,
      description: 'Piano intermedio con 1000 minuti al mese',
      active: true
    },
    {
      code: 'PLAN_2000',
      includedMinutes: 2000,
      description: 'Piano avanzato con 2000 minuti al mese',
      active: true
    }
  ];

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      update: {
        includedMinutes: plan.includedMinutes,
        description: plan.description,
        active: plan.active
      },
      create: plan
    });
  }

  let client = await prisma.client.findFirst({
    where: { name: DEMO_CLIENT_NAME }
  });

  if (!client) {
    client = await prisma.client.create({
      data: {
        name: DEMO_CLIENT_NAME,
        notificationEmail: process.env.CONTACT_EMAIL || null,
        timezone: 'Europe/Rome',
        locale: 'it-IT',
        planCode: 'PLAN_500',
        planMinutesLimit: 500,
        hardLimit: true
      }
    });
  }

  await prisma.clientNumber.upsert({
    where: {
      clientId_twilioPhoneNumber: {
        clientId: client.id,
        twilioPhoneNumber: TWILIO_INBOUND_NUMBER
      }
    },
    update: {
      clientId: client.id,
      description: 'Numero principale di test'
    },
    create: {
      clientId: client.id,
      twilioPhoneNumber: TWILIO_INBOUND_NUMBER,
      description: 'Numero principale di test'
    }
  });

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  await prisma.user.upsert({
    where: { email: DEMO_EMAIL.toLowerCase() },
    update: {
      clientId: client.id,
      passwordHash,
      role: 'owner'
    },
    create: {
      clientId: client.id,
      email: DEMO_EMAIL.toLowerCase(),
      passwordHash,
      role: 'owner'
    }
  });

  const clientNumber = await prisma.clientNumber.findFirstOrThrow({
    where: {
      clientId: client.id,
      twilioPhoneNumber: TWILIO_INBOUND_NUMBER
    }
  });

  const demoCalls = [
    {
      sid: 'CA_DEMO_AFTER_RING_001',
      from: '+393331112233',
      lead: {
        capturedName: 'Marco Bianchi',
        capturedPhone: '+393331112233',
        capturedEmail: 'marco.bianchi@example.com',
        capturedReason: 'Richiesta consulenza per contratto commerciale',
        preferredContactTime: 'Domani mattina',
        rawSummary:
          'Marco ha chiamato per una consulenza su un contratto commerciale urgente. Preferisce essere richiamato domani mattina.',
        extraFields: {
          priority: 'high',
          practiceArea: 'Diritto commerciale'
        }
      }
    },
    {
      sid: 'CA_DEMO_AFTER_RING_002',
      from: '+393445556677',
      lead: {
        capturedName: 'Giulia Rossi',
        capturedPhone: '+393445556677',
        capturedEmail: 'giulia.rossi@example.com',
        capturedReason: 'Informazioni su separazione consensuale',
        preferredContactTime: 'Oggi pomeriggio',
        rawSummary:
          'Giulia cerca informazioni sui tempi e sui documenti necessari per una separazione consensuale.',
        extraFields: {
          priority: 'medium',
          practiceArea: 'Diritto di famiglia'
        }
      }
    },
    {
      sid: 'CA_DEMO_AFTER_RING_003',
      from: '+393498887766',
      lead: {
        capturedName: 'Luca Verdi',
        capturedPhone: '+393498887766',
        capturedEmail: null,
        capturedReason: 'Richiamare per recupero crediti',
        preferredContactTime: 'Lunedi dopo le 17',
        rawSummary:
          'Luca vuole parlare con lo studio per valutare un recupero crediti verso un cliente insolvente.',
        extraFields: {
          priority: 'medium',
          practiceArea: 'Recupero crediti'
        }
      }
    }
  ];

  for (const [index, demo] of demoCalls.entries()) {
    const billableSeconds = 90 + index * 45;
    const startedAt = new Date(Date.now() - (index + 1) * 60 * 60 * 1000);
    const endedAt = new Date(startedAt.getTime() + billableSeconds * 1000);

    const callSession = await prisma.callSession.upsert({
      where: { twilioCallSid: demo.sid },
      update: {
        clientId: client.id,
        clientNumberId: clientNumber.id,
        fromNumber: demo.from,
        toNumber: TWILIO_INBOUND_NUMBER,
        billableSeconds,
        status: 'completed'
      },
      create: {
        clientId: client.id,
        clientNumberId: clientNumber.id,
        twilioCallSid: demo.sid,
        mediaStreamToken: `demo-media-stream-token-${index + 1}`,
        fromNumber: demo.from,
        toNumber: TWILIO_INBOUND_NUMBER,
        startedAt,
        endedAt,
        billableSeconds,
        status: 'completed'
      }
    });

    const existingLead = await prisma.intakeLead.findFirst({
      where: {
        clientId: client.id,
        callSessionId: callSession.id,
        capturedPhone: demo.lead.capturedPhone
      }
    });

    const leadData = {
      clientId: client.id,
      callSessionId: callSession.id,
      capturedName: demo.lead.capturedName,
      capturedPhone: demo.lead.capturedPhone,
      capturedEmail: demo.lead.capturedEmail,
      capturedReason: demo.lead.capturedReason,
      preferredContactTime: demo.lead.preferredContactTime,
      rawSummary: demo.lead.rawSummary,
      extraFields: demo.lead.extraFields
    };

    if (existingLead) {
      await prisma.intakeLead.update({
        where: { id: existingLead.id },
        data: leadData
      });
    } else {
      await prisma.intakeLead.create({
        data: leadData
      });
    }
  }

  console.log('Seed completed: plans + demo client + client number + demo user + recall leads');
  console.log(`Demo credentials: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error('Seed failed', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
