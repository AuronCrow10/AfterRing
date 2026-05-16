// src/utils/barge-in.ts
export interface BargeInOptions {
  avgAbsThreshold?: number;
  framesRequired?: number;
}

const DEFAULT_AVG_ABS_THRESHOLD = 950;
const DEFAULT_FRAMES_REQUIRED = 3;

export function muLawToLinearSample(muLawByte: number): number {
  let muLaw = (~muLawByte) & 0xff;
  const sign = muLaw & 0x80;
  const exponent = (muLaw >> 4) & 0x07;
  const mantissa = muLaw & 0x0f;
  let sample = ((mantissa << 3) + 0x84) << exponent;
  sample = sign ? 0x84 - sample : sample - 0x84;
  return sample;
}

export function isLikelySpeech(
  muLawBase64: string,
  avgAbsThreshold = DEFAULT_AVG_ABS_THRESHOLD
): boolean {
  const buffer = Buffer.from(muLawBase64, 'base64');
  if (buffer.length === 0) return false;
  let sumAbs = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    sumAbs += Math.abs(muLawToLinearSample(buffer[i]));
  }
  const avgAbs = sumAbs / buffer.length;
  return avgAbs >= avgAbsThreshold;
}

export function createBargeInDetector(options: BargeInOptions = {}) {
  const avgAbsThreshold = options.avgAbsThreshold ?? DEFAULT_AVG_ABS_THRESHOLD;
  const framesRequired = options.framesRequired ?? DEFAULT_FRAMES_REQUIRED;
  let speechFrameCount = 0;

  return {
    shouldInterrupt(muLawBase64: string, speaking: boolean): boolean {
      if (!speaking) {
        speechFrameCount = 0;
        return false;
      }
      if (!isLikelySpeech(muLawBase64, avgAbsThreshold)) {
        speechFrameCount = 0;
        return false;
      }

      speechFrameCount += 1;
      if (speechFrameCount < framesRequired) {
        return false;
      }

      speechFrameCount = 0;
      return true;
    }
  };
}
