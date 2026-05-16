import type { NextFunction, Request, Response } from 'express';
import logger from '../config/logger';
import { getAuthFromRequest } from './auth';

type RateLimitKey = 'ip' | 'authOrIp';

type RateLimitOptions = {
  windowMs: number;
  max: number;
  key?: RateLimitKey;
  name: string;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();
let lastCleanupAt = 0;

function getClientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function cleanupExpiredBuckets(now: number) {
  if (now - lastCleanupAt < 60_000) return;
  lastCleanupAt = now;

  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

function getRateLimitSubject(req: Request, key: RateLimitKey): string {
  if (key === 'authOrIp') {
    const auth = getAuthFromRequest(req);
    if (auth?.sub) return `user:${auth.sub}`;
  }
  return `ip:${getClientIp(req)}`;
}

export function rateLimit(options: RateLimitOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    cleanupExpiredBuckets(now);

    const key = options.key ?? 'ip';
    const subject = getRateLimitSubject(req, key);
    const bucketKey = `${options.name}:${subject}`;
    const current = buckets.get(bucketKey);
    const bucket =
      current && current.resetAt > now
        ? current
        : {
            count: 0,
            resetAt: now + options.windowMs
          };

    bucket.count += 1;
    buckets.set(bucketKey, bucket);

    const remaining = Math.max(options.max - bucket.count, 0);
    const retryAfterSeconds = Math.max(Math.ceil((bucket.resetAt - now) / 1000), 1);

    res.setHeader('RateLimit-Limit', String(options.max));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > options.max) {
      res.setHeader('Retry-After', String(retryAfterSeconds));
      logger.warn(
        { limiter: options.name, subject, path: req.originalUrl, retryAfterSeconds },
        'Rate limit exceeded'
      );
      return res.status(429).json({
        error: 'Too many requests',
        retryAfterSeconds
      });
    }

    return next();
  };
}
