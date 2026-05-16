// src/config/env.ts
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production']).default('development'),
  PORT: z
    .string()
    .default('3000')
    .transform((v) => parseInt(v, 10))
    .refine((v) => !Number.isNaN(v) && v > 0, 'PORT must be a positive number'),
  LOG_LEVEL: z.string().default('info'),

  DATABASE_URL: z.string().min(1),

  OPENAI_API_KEY: z.string().min(1),
  OPENAI_REALTIME_MODEL: z.string().default('gpt-realtime'),

  DEEPGRAM_API_KEY: z.string().min(1),
  DEEPGRAM_TTS_MODEL: z.string().min(1),
  DEEPGRAM_TTS_ENCODING: z.string().default('mulaw'),
  DEEPGRAM_TTS_SAMPLE_RATE: z
    .string()
    .default('8000')
    .transform((v) => parseInt(v, 10))
    .refine((v) => !Number.isNaN(v) && v > 0, 'DEEPGRAM_TTS_SAMPLE_RATE must be positive'),

  TWILIO_ACCOUNT_SID: z.string().min(1),
  TWILIO_AUTH_TOKEN: z.string().min(1),
  TWILIO_API_KEY_SID: z.string().min(1),
  TWILIO_API_KEY_SECRET: z.string().min(1),
  TWILIO_TWIML_APP_SID: z.string().min(1),
  TWILIO_CALLER_ID: z.string().min(1),
  TWILIO_INBOUND_NUMBER: z.string().min(1),

  PUBLIC_BASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  AUTH_COOKIE_NAME: z.string().default('voiceai_session'),

  INTAKE_DEFAULT_LOCALE: z.string().default('it-IT'),
  ASSISTANT_TIMEZONE_LABEL: z.string().default('local'),
  MAILJET_API_KEY: z.string().min(1),
  MAILJET_API_SECRET: z.string().min(1),
  MAILJET_SMTP_HOST: z.string().default('in-v3.mailjet.com'),
  MAILJET_SMTP_PORT: z
    .string()
    .default('587')
    .transform((v) => parseInt(v, 10))
    .refine((v) => !Number.isNaN(v) && v > 0, 'MAILJET_SMTP_PORT must be positive'),
  MAIL_FROM_EMAIL: z.string().min(1),
  MAIL_FROM_NAME: z.string().default('Voice AI Assistant'),
  CONTACT_EMAIL: z.string().min(1),

  VAD_SILENCE_MS: z
    .string()
    .default('300')
    .transform((v) => parseInt(v, 10))
    .refine((v) => !Number.isNaN(v) && v >= 50, 'VAD_SILENCE_MS must be >= 50'),
  PHONE_CHUNK_DEADLINE_MS: z
    .string()
    .default('1500')
    .transform((v) => parseInt(v, 10))
    .refine(
      (v) => !Number.isNaN(v) && v >= 200,
      'PHONE_CHUNK_DEADLINE_MS must be >= 200'
    ),
  PHONE_ENTRY_TIMEOUT_MS: z
    .string()
    .default('2500')
    .transform((v) => parseInt(v, 10))
    .refine(
      (v) => !Number.isNaN(v) && v >= 500,
      'PHONE_ENTRY_TIMEOUT_MS must be >= 500'
    ),
  BARGE_IN_AVG_ABS_THRESHOLD: z
    .string()
    .default('950')
    .transform((v) => parseInt(v, 10))
    .refine(
      (v) => !Number.isNaN(v) && v > 0,
      'BARGE_IN_AVG_ABS_THRESHOLD must be > 0'
    ),
  BARGE_IN_FRAMES_REQUIRED: z
    .string()
    .default('3')
    .transform((v) => parseInt(v, 10))
    .refine(
      (v) => !Number.isNaN(v) && v >= 1,
      'BARGE_IN_FRAMES_REQUIRED must be >= 1'
    ),

  OPENAI_INPUT_COST_PER_1K: z
    .string()
    .default('0')
    .transform((v) => parseFloat(v))
    .refine((v) => !Number.isNaN(v) && v >= 0, 'OPENAI_INPUT_COST_PER_1K must be >= 0'),
  OPENAI_OUTPUT_COST_PER_1K: z
    .string()
    .default('0')
    .transform((v) => parseFloat(v))
    .refine((v) => !Number.isNaN(v) && v >= 0, 'OPENAI_OUTPUT_COST_PER_1K must be >= 0'),
  DEEPGRAM_TTS_COST_PER_1K_CHARS: z
    .string()
    .default('0')
    .transform((v) => parseFloat(v))
    .refine((v) => !Number.isNaN(v) && v >= 0, 'DEEPGRAM_TTS_COST_PER_1K_CHARS must be >= 0'),
  TWILIO_COST_PER_MINUTE: z
    .string()
    .default('0')
    .transform((v) => parseFloat(v))
    .refine((v) => !Number.isNaN(v) && v >= 0, 'TWILIO_COST_PER_MINUTE must be >= 0')
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
