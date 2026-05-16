// src/config/openai-realtime.ts
import WebSocket from 'ws';
import { env } from './env';

export function createRealtimeWebSocket(): WebSocket {
  const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(env.OPENAI_REALTIME_MODEL)}`;
  const ws = new WebSocket(url, {
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`
    }
  });
  return ws;
}
