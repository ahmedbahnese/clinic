import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectPwaEnvironment,
  getPwaInstallInstructions,
  isPwaStandaloneMode,
} from './pwaInstall.ts';

test('detectPwaEnvironment identifies iPhone Safari', () => {
  assert.deepEqual(
    detectPwaEnvironment({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
      platform: 'iPhone',
      userAgentDataBrands: ['Chromium', 'Google Chrome'],
    }),
    { platform: 'ios', browser: 'safari' },
  );
});

test('detectPwaEnvironment recognizes touch-enabled iPadOS when it presents as MacIntel', () => {
  assert.deepEqual(
    detectPwaEnvironment({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 5,
    }),
    { platform: 'ios', browser: 'safari' },
  );
});

test('detectPwaEnvironment identifies Android Chrome and Edge from browser hints', () => {
  assert.deepEqual(
    detectPwaEnvironment({ userAgent: 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36' }),
    { platform: 'android', browser: 'chrome' },
  );
  assert.deepEqual(
    detectPwaEnvironment({ userAgent: 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/131.0.0.0 EdgA/131.0.0.0 Mobile Safari/537.36' }),
    { platform: 'android', browser: 'edge' },
  );
});

test('detectPwaEnvironment identifies desktop Edge and Safari', () => {
  assert.deepEqual(
    detectPwaEnvironment({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0' }),
    { platform: 'desktop', browser: 'edge' },
  );
  assert.deepEqual(
    detectPwaEnvironment({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15', platform: 'MacIntel' }),
    { platform: 'desktop', browser: 'safari' },
  );
});

test('iPhone fallback explains Safari Add to Home Screen without claiming installation', () => {
  const instructions = getPwaInstallInstructions({ platform: 'ios', browser: 'safari' });
  assert.match(instructions.steps.join(' '), /Safari/);
  assert.match(instructions.steps.join(' '), /إضافة إلى الشاشة الرئيسية/);
  assert.match(instructions.note, /لا يستطيع الموقع/);
});

test('non-Safari iPhone fallback directs users to Safari', () => {
  const instructions = getPwaInstallInstructions({ platform: 'ios', browser: 'chrome' });
  assert.match(instructions.steps.join(' '), /افتح رابط العيادات في Safari/);
});

test('Android fallback distinguishes Chrome/Edge menu from unsupported browsers', () => {
  assert.match(
    getPwaInstallInstructions({ platform: 'android', browser: 'chrome' }).steps.join(' '),
    /Chrome/,
  );
  assert.match(
    getPwaInstallInstructions({ platform: 'android', browser: 'other' }).steps.join(' '),
    /Chrome أو Edge/,
  );
});

test('desktop fallback provides Chrome, Edge, and Safari-specific routes', () => {
  assert.match(getPwaInstallInstructions({ platform: 'desktop', browser: 'chrome' }).steps.join(' '), /Chrome/);
  assert.match(getPwaInstallInstructions({ platform: 'desktop', browser: 'edge' }).steps.join(' '), /Edge/);
  assert.match(getPwaInstallInstructions({ platform: 'desktop', browser: 'safari' }).steps.join(' '), /Dock/);
});

test('standalone state accepts either modern display-mode or iOS legacy signal', () => {
  assert.equal(isPwaStandaloneMode(true, false), true);
  assert.equal(isPwaStandaloneMode(false, true), true);
  assert.equal(isPwaStandaloneMode(false, false), false);
});
