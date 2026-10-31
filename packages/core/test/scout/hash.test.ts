import { describe, expect, it } from 'vitest';
import { routeHash, scoutHash } from '../../src/scout/hash.js';
import type { InteractiveElement, TestIdElement } from '../../src/scout/types.js';

const claim: InteractiveElement = { role: 'button', name: 'Claim', count: 1 };
const offer: InteractiveElement = { role: 'textbox', name: 'Offer', count: 1 };
const status: TestIdElement = { testId: 'status' };
const other: TestIdElement = { testId: 'other', role: 'paragraph' };

describe('routeHash', () => {
  it('is 16 hex characters', () => {
    expect(routeHash('ok', [claim], [])).toMatch(/^[0-9a-f]{16}$/);
  });

  it('ignores the order of elements and testIds', () => {
    expect(routeHash('ok', [claim, offer], [status, other])).toBe(routeHash('ok', [offer, claim], [other, status]));
  });

  it('changes with count, label, testIds and status', () => {
    const base = routeHash('ok', [claim, offer], [status]);
    expect(routeHash('ok', [{ ...claim, count: 2 }, offer], [status])).not.toBe(base);
    expect(routeHash('ok', [claim, { ...offer, label: 'Offer' }], [status])).not.toBe(base);
    expect(routeHash('ok', [claim, offer], [])).not.toBe(base);
    expect(routeHash('redirected', [claim, offer], [status])).not.toBe(base);
  });
});

describe('scoutHash', () => {
  it('ignores route order and changes with any routeHash', () => {
    const a = { path: '/', routeHash: 'aaaa' };
    const b = { path: '/market', routeHash: 'bbbb' };
    expect(scoutHash([a, b])).toBe(scoutHash([b, a]));
    expect(scoutHash([a, { ...b, routeHash: 'cccc' }])).not.toBe(scoutHash([a, b]));
    expect(scoutHash([a, b])).toMatch(/^[0-9a-f]{16}$/);
  });
});
