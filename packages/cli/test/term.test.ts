import type { SummonResult, Verdicts } from '@poltergeist/core';
import { describe, expect, it } from 'vitest';
import { criterion } from '../../core/test/compiler/criteria.js';
import { renderBoard, renderHeader } from '../src/term/board.js';
import { colorEnabled, paint, termSafe } from '../src/term/color.js';
import { ghostLine, LiveBlock } from '../src/term/live.js';

const ECTO = '38;2;125;255;176';
// eslint-disable-next-line no-control-regex -- stripping ANSI escapes is the point
const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

describe('colorEnabled', () => {
  it.each([
    [{ isTTY: true }, {}, true],
    [{ isTTY: true }, { NO_COLOR: '1' }, false],
    [{ isTTY: false }, {}, false],
    [{}, {}, false],
    [{ isTTY: true }, { NO_COLOR: '' }, true],
  ])('%j %j → %s', (stream, env, want) => expect(colorEnabled(stream, env)).toBe(want));
});

describe('paint and termSafe', () => {
  it('wraps in a 24-bit colour only when on', () => {
    expect(paint('x', 'haunted', true)).toBe('\x1b[38;2;255;59;92mx\x1b[39m');
    expect(paint('x', 'haunted', false)).toBe('x');
  });
  it('strips escape sequences and bidi characters from untrusted text', () => {
    const s = termSafe('a\x1b[2Jb‮c', 80);
    expect(s).not.toContain('\x1b');
    expect(s).not.toContain('‮');
  });
  it('clips to the width', () => expect(termSafe('x'.repeat(50), 10)).toHaveLength(10));
});

describe('ghostLine', () => {
  it('shows the initial, persona, criterion, rep and step', () => {
    expect(ghostLine({ persona: 'wraith', criterion: '3.2', rep: 1, step: 'click' }, false)).toBe('W  wraith  3.2  r1  click');
  });
  it('paints the ghost in ectoplasm when colour is on', () => {
    expect(ghostLine({ persona: 'doppelganger', criterion: '3.2', rep: 2 }, true)).toContain(ECTO);
  });
});

function result(): SummonResult {
  const criteria = [criterion('3.1', 'THE Claims page SHALL load.'), criterion('3.2', 'WHEN two sessions claim at once, THE System SHALL record only one claim, and this text is long enough to clip.'), criterion('4.1', 'THE System SHALL show a receipt.')];
  const verdicts: Verdicts = {
    reps: 3, threshold: 2, pairs: [],
    criteria: [{ criterion: '3.1', verdict: 'clean', personas: {} }, { criterion: '3.2', verdict: 'haunted', personas: {} }],
    counts: { haunted: 1, flaky: 0, inconclusive: 0, clean: 1, notApplicable: 4, uncompilable: 0 },
  };
  return {
    runId: 'r1', runDir: '/p/.poltergeist/runs/r1', specDir: '/p/spec', target: 'http://127.0.0.1:4000', criteria, compiled: [], verdicts,
    haunted: ['3.2'], allResetsFailed: false, reportPaths: { markdownPath: '/p/spec/haunting-report.md', jsonPath: '/p/spec/haunting-report.json' },
  };
}

describe('renderBoard', () => {
  it('lists every criterion with its glyph, clipped to the width, then the counts and the report path', () => {
    const out = renderBoard(result(), { color: false, width: 60, cwd: '/p' });
    const lines = out.split('\n');
    expect(lines.find((l) => l.startsWith('[ok] 3.1'))).toBeDefined();
    expect(lines.find((l) => l.startsWith('[!!] 3.2'))).toBeDefined();
    expect(lines.find((l) => l.startsWith('[  ] 4.1'))).toBeDefined();
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(60);
    expect(out).toContain('haunted 1');
    expect(out).toContain('report: spec/haunting-report.md');
    expect(out).not.toContain('\x1b');
  });
  it('colours verdicts by THEME, and never in ectoplasm', () => {
    const out = renderBoard(result(), { color: true, width: 100, cwd: '/p' });
    expect(out).toContain('\x1b[38;2;255;59;92m[!!]');
    expect(out).toContain('\x1b[38;2;214;217;204m[ok]');
    expect(out).not.toContain(ECTO);
    expect(plain(out)).toContain('[!!] 3.2');
  });
  it('strips escape sequences from criterion text', () => {
    const r = result();
    r.criteria[0] = criterion('3.1', 'evil\x1b[2J text');
    expect(renderBoard(r, { color: false, width: 80, cwd: '/p' })).not.toContain('\x1b');
  });
});

describe('renderHeader', () => {
  it('has the wordmark and the summary line', () => {
    const out = renderHeader({ specDir: 'spec', target: 'http://127.0.0.1:4000', criteria: 2, personas: 3, reps: 3 }, false);
    expect(out).toContain('your spec, haunted.');
    expect(out).toContain('haunting 2 criteria × 3 personas × 3 reps → http://127.0.0.1:4000');
  });
});

describe('LiveBlock', () => {
  it('redraws in place, one line per active ghost', () => {
    let out = '';
    const block = new LiveBlock({ write: (s) => (out += s) }, 12);
    block.update('g1', 'one');
    block.update('g2', 'two');
    block.remove('g1');
    const last = out.split('\x1b[J').at(-1)!;
    expect(last).toBe('two\n');
    expect(out).toContain('\x1b[2F');
    block.clear();
    expect(out.endsWith('\x1b[1F\x1b[J')).toBe(true);
  });
  it('shows at most maxLines ghosts', () => {
    let out = '';
    const block = new LiveBlock({ write: (s) => (out += s) }, 2);
    for (const id of ['a', 'b', 'c']) block.update(id, id);
    expect(out.split('\x1b[J').at(-1)).toBe('b\nc\n');
  });
});
