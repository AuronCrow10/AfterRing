// src/config/db.ts
import { PrismaClient } from '@prisma/client';
import logger from './logger';

export const prisma = new PrismaClient();

prisma
  .$connect()
  .then(() => {
    logger.info('Connected to PostgreSQL via Prisma');
  })
  .catch((err) => {
    logger.error({ err }, 'Failed to connect to PostgreSQL');
    process.exit(1);
  });
