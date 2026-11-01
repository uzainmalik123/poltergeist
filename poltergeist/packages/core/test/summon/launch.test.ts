import { describe, expect, it } from 'vitest';
import { summonLaunchOptions } from '../../src/summon/summon.js';

describe('summonLaunchOptions', () => {
  it('leaves Ctrl-C to the caller and keeps the guard flags (F09 review)', () => {
    const o = summonLaunchOptions();
    expect(o.handleSIGINT).toBe(false);
    expect(o.handleSIGTERM).toBeUndefined();
    expect(o.args?.some((a) => a.includes('webrtc') || a.includes('WebRTC'))).toBe(true);
  });
});
