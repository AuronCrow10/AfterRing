/* eslint-disable no-console */
const assert = require('assert');

const {
  createBargeInDetector,
  isLikelySpeech
} = require('../dist/utils/barge-in');

const BIAS = 0x84;
const MAX = 0x1fff;

function linearToMuLawSample(sample) {
  let sign = 0;
  if (sample < 0) {
    sign = 0x80;
    sample = -sample;
  }

  if (sample > MAX) {
    sample = MAX;
  }

  sample += BIAS;
  let exponent = 7;
  for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; expMask >>= 1) {
    exponent -= 1;
  }
  const mantissa = (sample >> (exponent + 3)) & 0x0f;
  const muLaw = ~(sign | (exponent << 4) | mantissa);
  return muLaw & 0xff;
}

function makeFrame(amplitude, frameSize = 160) {
  const buffer = Buffer.alloc(frameSize);
  for (let i = 0; i < frameSize; i += 1) {
    buffer[i] = linearToMuLawSample(amplitude);
  }
  return buffer.toString('base64');
}

function run() {
  const silence = makeFrame(0);
  const speech = makeFrame(10000);

  assert.strictEqual(isLikelySpeech(silence), false, 'silence should not trigger speech');
  assert.strictEqual(isLikelySpeech(speech), true, 'speech should trigger speech');

  const detector = createBargeInDetector({ avgAbsThreshold: 950, framesRequired: 3 });

  assert.strictEqual(detector.shouldInterrupt(speech, false), false, 'not speaking -> no interrupt');
  assert.strictEqual(detector.shouldInterrupt(speech, true), false, 'first speech frame -> no interrupt');
  assert.strictEqual(detector.shouldInterrupt(speech, true), false, 'second speech frame -> no interrupt');
  assert.strictEqual(detector.shouldInterrupt(speech, true), true, 'third speech frame -> interrupt');
  assert.strictEqual(detector.shouldInterrupt(speech, true), false, 'after interrupt -> reset');

  assert.strictEqual(detector.shouldInterrupt(silence, true), false, 'silence -> no interrupt');

  console.log('Barge-in harness: OK');
}

run();
