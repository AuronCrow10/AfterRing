// src/services/deepgram-tts.service.ts
import { Readable } from 'stream';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import logger from '../config/logger';
import { deepgramClient } from '../config/deepgram';
import { env } from '../config/env';

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath as string);
}

class DeepgramTtsService {
  async synthesizeToMuLaw(
    text: string,
    locale: string,
    modelOverride?: string
  ): Promise<Buffer> {
    const trimmed = text.trim();
    if (!trimmed) {
      throw new Error('Cannot synthesize empty text');
    }

    const model = modelOverride || env.DEEPGRAM_TTS_MODEL;
    const encoding = env.DEEPGRAM_TTS_ENCODING;
    const sampleRate = env.DEEPGRAM_TTS_SAMPLE_RATE;

    try {
      const response = await deepgramClient.post(
        `/speak?model=${encodeURIComponent(model)}&encoding=${encodeURIComponent(
          encoding
        )}&sample_rate=${encodeURIComponent(String(sampleRate))}`,
        { text: trimmed },
        {
          responseType: 'arraybuffer',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'audio/*'
          }
        }
      );

      const audioBuffer = Buffer.from(response.data as ArrayBuffer);
      const contentType = (response.headers['content-type'] as string | undefined) ?? '';
      const hasWavHeader = audioBuffer.slice(0, 4).toString('ascii') === 'RIFF';

      if (encoding === 'mulaw' && sampleRate === 8000 && !contentType.includes('wav') && !hasWavHeader) {
        logger.info({ textLength: trimmed.length, locale }, 'Deepgram TTS completed');
        return audioBuffer;
      }

      const inputFormat =
        contentType.includes('wav') || hasWavHeader
          ? 'wav'
          : contentType.includes('mpeg')
            ? 'mp3'
            : 'mp3';

      const mulaw = await this.convertToMuLaw(audioBuffer, inputFormat);
      logger.info({ textLength: trimmed.length, locale }, 'Deepgram TTS completed');
      return mulaw;
    } catch (err) {
      logger.error({ err }, 'Error during Deepgram TTS synthesis');
      throw err;
    }
  }

  private convertToMuLaw(input: Buffer, inputFormat: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const readable = new Readable();
      readable._read = () => {};
      readable.push(input);
      readable.push(null);

      const chunks: Buffer[] = [];

      const command = ffmpeg(readable)
        .inputFormat(inputFormat)
        .audioCodec('pcm_mulaw')
        .audioFrequency(8000)
        .audioChannels(1)
        .format('mulaw')
        .on('error', (err) => {
          logger.error({ err }, 'ffmpeg conversion to mu-law failed');
          reject(err);
        });

      const stream = command.pipe();

      stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      stream.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
    });
  }
}

export const deepgramTtsService = new DeepgramTtsService();
export type DeepgramTtsServiceType = DeepgramTtsService;
