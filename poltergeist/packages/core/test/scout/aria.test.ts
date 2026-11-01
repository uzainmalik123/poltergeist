import { describe, expect, it } from 'vitest';
import { interactiveFromSnapshot, parseAriaLine } from '../../src/scout/aria.js';

// Shape verified against playwright-core 1.64.1's ariaSnapshot().
const SNAPSHOT = [
  '- heading "Market" [level=1]',
  '- navigation:',
  '  - link "Home":',
  '    - /url: /x',
  '- textbox "Candy \\"name\\""',
  '- button "a\\\\b \\"c\\"": x',
  '- checkbox "Agree" [checked]',
  '- textbox',
  '- text: ok',
].join('\n');

describe('parseAriaLine', () => {
  it('reads role and name', () => {
    expect(parseAriaLine('  - button "Claim Sour Skulls"')).toEqual({ role: 'button', name: 'Claim Sour Skulls' });
  });

  it('fully unescapes names', () => {
    expect(parseAriaLine('- button "a\\\\b \\"c\\"": x')).toEqual({ role: 'button', name: 'a\\b "c"' });
    expect(parseAriaLine('- button "line\\nbreak caf\\u00e9"')?.name).toBe('line\nbreak café');
  });

  it('skips attributes and handles unnamed roles', () => {
    expect(parseAriaLine('- checkbox "Agree" [checked]')).toEqual({ role: 'checkbox', name: 'Agree' });
    expect(parseAriaLine('- combobox "Pick" [expanded] [disabled]:')).toEqual({ role: 'combobox', name: 'Pick' });
    expect(parseAriaLine('- textbox')).toEqual({ role: 'textbox', name: '' });
  });

  it('returns null for text, properties, blanks and regex names', () => {
    expect(parseAriaLine('- text: ok')).toBeNull();
    expect(parseAriaLine('    - /url: /x')).toBeNull();
    expect(parseAriaLine('')).toBeNull();
    expect(parseAriaLine('- button /Claim \\d+/')).toBeNull();
  });
});

describe('interactiveFromSnapshot', () => {
  it('keeps interactive roles in document order', () => {
    expect(interactiveFromSnapshot(SNAPSHOT)).toEqual([
      { role: 'link', name: 'Home', count: 1 },
      { role: 'textbox', name: 'Candy "name"', count: 1 },
      { role: 'button', name: 'a\\b "c"', count: 1 },
      { role: 'checkbox', name: 'Agree', count: 1 },
      { role: 'textbox', name: '', count: 1 },
    ]);
  });

  it('merges duplicates into the first occurrence', () => {
    const yaml = ['- button "Claim"', '- link "Home"', '- button "Claim"'].join('\n');
    expect(interactiveFromSnapshot(yaml)).toEqual([
      { role: 'button', name: 'Claim', count: 2 },
      { role: 'link', name: 'Home', count: 1 },
    ]);
  });

  it('keeps long names whole', () => {
    const name = 'x'.repeat(300);
    expect(interactiveFromSnapshot(`- button "${name}"`)[0]?.name).toBe(name);
  });
});
