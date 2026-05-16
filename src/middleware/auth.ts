// src/middleware/auth.ts
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { authService, type AuthTokenPayload } from '../services/auth.service';

export type AuthContext = AuthTokenPayload;

export type AuthedRequest = Request & {
  auth: AuthContext;
};

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return header.split(';').reduce<Record<string, string>>((acc, part) => {
    const index = part.indexOf('=');
    if (index === -1) return acc;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

export function getAuthFromRequest(req: Request): AuthContext | null {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[env.AUTH_COOKIE_NAME];
  if (!token) return null;
  return authService.verifySessionToken(token);
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = getAuthFromRequest(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  (req as AuthedRequest).auth = auth;
  return next();
}

export function setAuthCookie(res: Response, token: string) {
  res.cookie(env.AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    maxAge: authService.getCookieMaxAgeSeconds() * 1000
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(env.AUTH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/'
  });
}
