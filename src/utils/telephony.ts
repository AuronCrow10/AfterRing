// src/utils/telephony.ts
import { env } from '../config/env';

export function normalizePhoneE164(phone: string): string {
  let value = (phone || '').trim();
  if (value.startsWith('+')) {
    return value;
  }
  value = value.replace(/[^\d]/g, '');
  if (value.startsWith('00')) {
    value = value.slice(2);
  }
  if (value.length === 10) {
    return `+39${value}`;
  }
  if (value.length === 9) {
    return `+39${value}`;
  }
  if (!value.startsWith('3') && !value.startsWith('39') && !value.startsWith('0')) {
    return `+${value}`;
  }
  if (value.startsWith('39')) {
    return `+${value}`;
  }
  return `+39${value}`;
}

export function buildMediaStreamUrl(): string {
  const base = new URL(env.PUBLIC_BASE_URL);
  base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  base.pathname = '/twilio/media-stream';
  base.search = '';
  base.hash = '';
  return base.toString();
}
