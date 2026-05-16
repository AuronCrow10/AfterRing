// src/server.ts
import express from 'express';
import http from 'http';
import helmet from 'helmet';
import cors from 'cors';
import next from 'next';
import { WebSocketServer } from 'ws';
import { env } from './config/env';
import logger from './config/logger';
import { requestLogger } from './middleware/request-logger';
import { errorHandler } from './middleware/error-handler';
import healthRouter from './routes/health';
import twilioVoiceRouter from './routes/twilio-voice';
import twilioTokenRouter from './routes/twilio-token';
import recallsRouter from './routes/recalls';
import contactRouter from './routes/contact';
import authRouter from './routes/auth';
import callsRouter from './routes/calls';
import { initTwilioMediaStreamServer } from './services/twilio-media.service';

export async function createServer(): Promise<http.Server> {
  const app = express();

  const isProd = env.NODE_ENV === 'production';
  if (isProd) {
    app.set('trust proxy', 1);
  }

  const nextApp = next({ dev: !isProd, dir: process.cwd() });
  const nextHandler = nextApp.getRequestHandler();
  await nextApp.prepare();

  // Helmet + CSP
  if (isProd) {
    app.use(
      helmet({
        contentSecurityPolicy: {
          useDefaults: true,
          directives: {
            "default-src": ["'self'"],
            // Next injects bootstrap data inline during hydration.
            "script-src": [
              "'self'",
              "'unsafe-inline'"
            ],
            // allow any HTTPS/WSS so Twilio Voice SDK can talk to its infra
            "connect-src": ["'self'", "https:", "wss:"],
            "img-src": ["'self'", "data:", "https:"],
            "style-src": ["'self'", "'unsafe-inline'", "https:"],
            "font-src": ["'self'", "data:", "https:"]
          }
        }
      })
    );
  } else {
    // In development disable CSP entirely to avoid fighting provider SDK hosts.
    app.use(
      helmet({
        contentSecurityPolicy: false
      })
    );
  }

  // CORS
  if (isProd) {
    const allowedOrigins = [env.PUBLIC_BASE_URL, 'http://localhost:3000', 'https://localhost:3000'];
    app.use(
      cors({
        origin(origin, callback) {
          // no Origin header (curl, Twilio webhooks etc.) -> allow
          if (!origin) {
            return callback(null, true);
          }
          if (allowedOrigins.includes(origin)) {
            return callback(null, true);
          }
          return callback(new Error(`Not allowed by CORS: ${origin}`));
        },
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: false
      })
    );
  } else {
    // Dev: allow all origins (browser + ngrok)
    app.use(
      cors({
        origin: true,
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: false
      })
    );
  }

  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        (req as typeof req & { rawBody?: Buffer }).rawBody = buf;
      }
    })
  );
  app.use(express.urlencoded({ extended: false }));
  app.use(requestLogger);

  app.use('/health', healthRouter);
  app.use('/', authRouter);
  app.use('/', callsRouter);
  app.use('/twilio', twilioVoiceRouter);
  app.use('/twilio', twilioTokenRouter);
  app.use('/', contactRouter);
  app.use('/', recallsRouter);

  app.all('*', (req, res) => {
    return nextHandler(req, res);
  });

  app.use(errorHandler);

  const server = http.createServer(app);

  const wss = new WebSocketServer({
    server,
    path: '/twilio/media-stream'
  });

  initTwilioMediaStreamServer(wss);

  logger.info(
    { port: env.PORT, mediaStreamPath: '/twilio/media-stream' },
    'HTTP and WebSocket servers created'
  );

  return server;
}
