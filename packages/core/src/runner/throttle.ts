import type { Page } from 'playwright-core';
import type { THROTTLE_PROFILES } from '../compiler/dsl.js';

export type ThrottleProfile = (typeof THROTTLE_PROFILES)[number];

/** Chrome DevTools' network presets (latency in ms, throughput in bytes/s). */
export const THROTTLE_PRESETS: Readonly<Record<ThrottleProfile, { latency: number; downloadThroughput: number; uploadThroughput: number }>> =
  Object.freeze({
    'slow-3g': { latency: 2000, downloadThroughput: 50000, uploadThroughput: 50000 },
    'fast-3g': { latency: 562.5, downloadThroughput: 180000, uploadThroughput: 84375 },
  });

/** The `throttle` step: CDP network emulation for this page (Chromium only). */
export async function applyThrottle(page: Page, profile: ThrottleProfile): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, ...THROTTLE_PRESETS[profile] });
}
