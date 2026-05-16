// src/middleware/error-handler.ts
import type { Request, Response, NextFunction } from 'express';
import logger from '../config/logger';

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  logger.error({ err, url: req.originalUrl }, 'Unhandled error');
  if (res.headersSent) {
    return;
  }
  const status = typeof err?.status === 'number' ? err.status : 500;
  res.status(status).json({ error: 'Internal server error' });
}
