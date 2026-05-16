// prisma/seed.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
// SET THIS TO YOUR REAL TWILIO INBOUND NUMBER (E.164).
// Example: "+390123456789"
const TWILIO_INBOUND_NUMBER = '+17076023342';
// <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

async function main() {
  if (!TWILIO_INBOUND_NUMBER || !TWILIO_INBOUND_NUMBER.startsWith('+')) {
    throw new Error(
      'Please set TWILIO_INBOUND_NUMBER at the top of prisma/seed.ts to your real Twilio number in E.164 format.'
    );
  }

  // ----------------------------------------------------
  // 1. Plans
  // ----------------------------------------------------
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
  ] as const;

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      update: {
        includedMinutes: plan.includedMinutes,
        description: plan.description,
        active: plan.active
      },
      create: {
        code: plan.code,
        includedMinutes: plan.includedMinutes,
        description: plan.description,
        active: plan.active
      }
    });
  }

  // ----------------------------------------------------
  // 2. Single demo client
  // ----------------------------------------------------
  const clientName = 'Studio Legale Demo';

  let client = await prisma.client.findFirst({
    where: { name: clientName }
  });

  if (!client) {
    client = await prisma.client.create({
      data: {
        name: clientName,
        timezone: 'Europe/Rome',
        locale: 'it-IT',
        planCode: 'PLAN_500',
        planMinutesLimit: 500,
        hardLimit: true
      }
    });
  }

  // ----------------------------------------------------
  // 3. ClientNumber for that client, using TWILIO_INBOUND_NUMBER
  // ----------------------------------------------------
  await prisma.clientNumber.upsert({
    where: {
      twilioPhoneNumber: TWILIO_INBOUND_NUMBER
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

  // eslint-disable-next-line no-console
  console.log('Seed completed: plans + 1 demo client + 1 client number');
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error('Seed failed', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
