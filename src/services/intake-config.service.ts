// src/services/intake-config.service.ts
import { z } from 'zod';
import { prisma } from '../config/db';
import { env } from '../config/env';
import type { IntakeFlow, IntakeStep } from '../types/intake';

const intakeStepSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  required: z.boolean()
});

const intakeFlowSchema = z.object({
  steps: z.array(intakeStepSchema).min(1)
});

const defaultStepsByLocale: Record<string, IntakeStep[]> = {
  it: [
    { id: 'name', label: 'Nome e cognome', required: true },
    { id: 'phone', label: 'Telefono per il richiamo', required: true },
    { id: 'reason', label: 'Motivo della chiamata', required: true },
    { id: 'preferredContactTime', label: 'Orario preferito', required: true }
  ],
  en: [
    { id: 'name', label: 'Full name', required: true },
    { id: 'phone', label: 'Callback phone', required: true },
    { id: 'reason', label: 'Reason for calling', required: true },
    { id: 'preferredContactTime', label: 'Preferred callback time', required: true }
  ],
  es: [
    { id: 'name', label: 'Nombre completo', required: true },
    { id: 'phone', label: 'Telefono para devolver la llamada', required: true },
    { id: 'reason', label: 'Motivo de la llamada', required: true },
    { id: 'preferredContactTime', label: 'Horario preferido', required: true }
  ],
  fr: [
    { id: 'name', label: 'Nom complet', required: true },
    { id: 'phone', label: 'Numero de rappel', required: true },
    { id: 'reason', label: "Motif de l'appel", required: true },
    { id: 'preferredContactTime', label: 'Horaire prefere', required: true }
  ],
  de: [
    { id: 'name', label: 'Vollstandiger Name', required: true },
    { id: 'phone', label: 'Rueckrufnummer', required: true },
    { id: 'reason', label: 'Grund des Anrufs', required: true },
    { id: 'preferredContactTime', label: 'Bevorzugte Rueckrufzeit', required: true }
  ]
};

function getDefaultSteps(locale: string): IntakeStep[] {
  const key = (locale || env.INTAKE_DEFAULT_LOCALE).toLowerCase().slice(0, 2);
  return defaultStepsByLocale[key] ?? defaultStepsByLocale.en;
}

export async function getIntakeFlowForClient(
  clientId: string,
  locale: string
): Promise<IntakeFlow> {
  const config = await prisma.clientIntakeConfig.findUnique({
    where: { clientId }
  });

  if (!config) {
    return { steps: getDefaultSteps(locale) };
  }

  const parsed = intakeFlowSchema.safeParse({ steps: config.steps });
  if (!parsed.success) {
    return { steps: getDefaultSteps(locale) };
  }

  return parsed.data;
}
