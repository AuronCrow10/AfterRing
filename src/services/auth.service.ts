// src/services/auth.service.ts
import crypto from 'crypto';
import { promisify } from 'util';
import { env } from '../config/env';

const scryptAsync = promisify(crypto.scrypt);
const HASH_PREFIX = 'scrypt';
const KEY_LENGTH = 64;
const JWT_ALG = 'HS256';
const JWT_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface AuthTokenPayload {
  sub: string;
  clientId: string;
  email: string;
  role: string;
  iat: number;
  exp: number;
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function decodeBase64Url(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(
    Math.ceil(input.length / 4) * 4,
    '='
  );
  return Buffer.from(padded, 'base64');
}

class AuthService {
  async hashPassword(password: string): Promise<string> {
    const salt = crypto.randomBytes(16).toString('hex');
    const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
    return `${HASH_PREFIX}:${salt}:${derived.toString('hex')}`;
  }

  async verifyPassword(password: string, storedHash: string): Promise<boolean> {
    const [prefix, salt, hash] = storedHash.split(':');
    if (prefix !== HASH_PREFIX || !salt || !hash) return false;
    const expected = Buffer.from(hash, 'hex');
    const actual = (await scryptAsync(password, salt, expected.length)) as Buffer;
    if (expected.length !== actual.length) return false;
    return crypto.timingSafeEqual(expected, actual);
  }

  signSessionToken(params: {
    userId: string;
    clientId: string;
    email: string;
    role: string;
  }): string {
    const now = Math.floor(Date.now() / 1000);
    const payload: AuthTokenPayload = {
      sub: params.userId,
      clientId: params.clientId,
      email: params.email,
      role: params.role,
      iat: now,
      exp: now + JWT_TTL_SECONDS
    };
    const encodedHeader = base64Url(JSON.stringify({ alg: JWT_ALG, typ: 'JWT' }));
    const encodedPayload = base64Url(JSON.stringify(payload));
    const unsigned = `${encodedHeader}.${encodedPayload}`;
    const signature = crypto
      .createHmac('sha256', env.JWT_SECRET)
      .update(unsigned)
      .digest();
    return `${unsigned}.${base64Url(signature)}`;
  }

  verifySessionToken(token: string): AuthTokenPayload | null {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [encodedHeader, encodedPayload, signature] = parts;
    const unsigned = `${encodedHeader}.${encodedPayload}`;
    const expected = base64Url(
      crypto.createHmac('sha256', env.JWT_SECRET).update(unsigned).digest()
    );
    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(signature);
    if (expectedBuffer.length !== actualBuffer.length) return null;
    if (!crypto.timingSafeEqual(expectedBuffer, actualBuffer)) return null;

    try {
      const header = JSON.parse(decodeBase64Url(encodedHeader).toString('utf8')) as {
        alg?: string;
      };
      if (header.alg !== JWT_ALG) return null;
      const payload = JSON.parse(
        decodeBase64Url(encodedPayload).toString('utf8')
      ) as AuthTokenPayload;
      if (!payload.sub || !payload.clientId || !payload.email || !payload.role) return null;
      if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
      return payload;
    } catch (_err) {
      return null;
    }
  }

  getCookieMaxAgeSeconds(): number {
    return JWT_TTL_SECONDS;
  }
}

export const authService = new AuthService();
