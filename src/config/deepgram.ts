// src/config/deepgram.ts
import axios from 'axios';
import { env } from './env';

export const deepgramClient = axios.create({
  baseURL: 'https://api.eu.deepgram.com/v1',
  timeout: 20000,
  headers: {
    Authorization: `Token ${env.DEEPGRAM_API_KEY}`
  }
});
