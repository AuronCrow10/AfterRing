// src/index.ts
import { env } from './config/env';
import logger from './config/logger';
import { createServer } from './server';

async function bootstrap() {
  try {
    const server = await createServer();
    server.listen(env.PORT, () => {
      logger.info({ port: env.PORT }, 'Server listening');
    });

    process.on('unhandledRejection', (reason) => {
      logger.error({ reason }, 'Unhandled promise rejection');
    });

    process.on('uncaughtException', (err) => {
      logger.error({ err }, 'Uncaught exception');
    });
  } catch (err) {
    logger.error({ err }, 'Failed to bootstrap server');
    process.exit(1);
  }
}

bootstrap();
