import { describe, expect, it } from 'vitest';
import { foldLive, framePath, initialLiveState, LIVE_PROTOCOL, reduceLive, type LiveMessage, type LiveState } from '../../src/live/index.js';

// PRD F12 (headless Live Feed, D-40): the pure state Reanimator folds run events into.

const started: LiveMessage = {
  type: 'run.started', t: 1, runId: 'r1', runDir: '/tmp/run/r1', specDir: '/spec', target: 'http://127.0.0.1:4000',
  criteria: ['3.1', '3.2'], personas: ['wraith', 'doppelganger'], reps: 3,
};
const spawn = (criterion: string, persona: 'wraith' | 'doppelganger', rep: number, actor: 'a' | 'b'): LiveMessage => ({
  type: 'ghost.spawned', t: 3, ghostId: `${criterion}__${persona}__r${rep}__${actor}`, criterion, persona, rep, actor,
});
const G = '3.2__doppelganger__r1__a';
const H = '3.2__doppelganger__r1__b';

/** The events up to a failed race assertion on 3.2. */
const race: LiveMessage[] = [
  started,
  { type: 'plan.compiled', t: 2, criterion: '3.2', persona: 'doppelganger', status: 'compiled', cached: false },
  { type: 'rep.started', t: 2, rep: 1 },
  spawn('3.2', 'doppelganger', 1, 'a'),
  spawn('3.2', 'doppelganger', 1, 'b'),
  { type: 'ghost.step', t: 4, ghostId: G, index: 2, step: 'click', outcome: 'ok', x: 10, y: 20 },
  { type: 'ghost.frame', t: 5, ghostId: G, seq: 3, jpegBase64: 'AA==' },
  { type: 'assert.result', t: 6, criterion: '3.2', persona: 'doppelganger', rep: 1, index: 0, ok: false, detail: 'two claims' },
];

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    for (const v of Object.values(o)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
}

const line = (s: LiveState, id: string) => s.lines.find((l) => l.id === id);

describe('reduceLive', () => {
  it('starts idle with no lines', () => {
    expect(initialLiveState()).toMatchObject({ phase: 'idle', rep: 0, reps: 0, lines: [], ghosts: {}, blocked: [], haunted: [] });
  });

  it('opens a waiting line per criterion on run.started', () => {
    const s = reduceLive(initialLiveState(), started);
    expect(s.lines.map((l) => [l.id, l.status])).toEqual([['3.1', 'waiting'], ['3.2', 'waiting']]);
    expect(s).toMatchObject({ phase: 'scouting', runId: 'r1', runDir: '/tmp/run/r1', target: 'http://127.0.0.1:4000', reps: 3 });
  });

  it('records the protocol from live.hello', () => {
    const s = reduceLive(initialLiveState(), { type: 'live.hello', protocol: LIVE_PROTOCOL, runId: 'r1', t: 0 });
    expect(s).toMatchObject({ protocol: 1, runId: 'r1' });
  });

  it('moves through compiling and running phases', () => {
    const s = foldLive(race.slice(0, 2));
    expect(s.phase).toBe('compiling');
    const r = foldLive(race.slice(0, 3));
    expect(r).toMatchObject({ phase: 'running', rep: 1 });
  });

  it('marks a line running and opens a tile when its ghost spawns', () => {
    const s = foldLive(race.slice(0, 4));
    expect(line(s, '3.2')?.status).toBe('running');
    expect(line(s, '3.1')?.status).toBe('waiting');
    expect(s.ghosts[G]).toMatchObject({ criterion: '3.2', persona: 'doppelganger', rep: 1, actor: 'a', done: false });
  });

  it('tracks step, cursor and latest frame per ghost', () => {
    const s = foldLive(race.slice(0, 7));
    expect(s.ghosts[G]).toMatchObject({ step: 'click', stepIndex: 2, outcome: 'ok', x: 10, y: 20, frame: { seq: 3, jpegBase64: 'AA==' } });
  });

  it('records a failed assertion with the pair ghosts of that rep', () => {
    const s = foldLive(race);
    expect(line(s, '3.2')?.failures).toEqual([{ persona: 'doppelganger', rep: 1, index: 0, detail: 'two claims', ghostIds: [G, H] }]);
  });

  it('ignores passing assertions', () => {
    const s = reduceLive(foldLive(race.slice(0, 5)), { ...(race[7] as Extract<LiveMessage, { type: 'assert.result' }>), ok: true });
    expect(line(s, '3.2')?.failures).toEqual([]);
  });

  it('links a haunted line to its first failing ghost and that ghost\'s latest frame', () => {
    const s = reduceLive(foldLive(race), { type: 'verdict.criterion', t: 9, criterion: '3.2', verdict: 'haunted' });
    expect(line(s, '3.2')).toMatchObject({ status: 'haunted', evidence: { ghostId: G, frame: `frames/${G}/00003.jpg` } });
  });

  it('gives a haunted line no frame when its ghost never sent one', () => {
    const noFrame = race.filter((e) => e.type !== 'ghost.frame');
    const s = reduceLive(foldLive(noFrame), { type: 'verdict.criterion', t: 9, criterion: '3.2', verdict: 'haunted' });
    expect(line(s, '3.2')?.evidence).toEqual({ ghostId: G });
  });

  it('sets a clean verdict without evidence', () => {
    const s = reduceLive(foldLive(race), { type: 'verdict.criterion', t: 9, criterion: '3.1', verdict: 'clean' });
    expect(line(s, '3.1')).toMatchObject({ status: 'clean' });
    expect(line(s, '3.1')?.evidence).toBeUndefined();
  });

  it('adds a line for a verdict on a criterion it never saw', () => {
    const s = reduceLive(foldLive(race), { type: 'verdict.criterion', t: 9, criterion: '9.9', verdict: 'flaky' });
    expect(line(s, '9.9')).toMatchObject({ status: 'flaky', failures: [] });
  });

  it('marks a rep\'s ghosts done when it finishes', () => {
    const s = reduceLive(foldLive(race), { type: 'rep.finished', t: 9, rep: 1, outcomes: { completed: 1, timeout: 0, planError: 0, systemError: 0 } });
    expect(s.ghosts[G]?.done).toBe(true);
    expect(s.ghosts[H]?.done).toBe(true);
  });

  it('collects guard blocks', () => {
    const s = reduceLive(foldLive(race), { type: 'guard.blocked', t: 9, ghostId: G, reason: 'host', url: 'https://example.com/' });
    expect(s.blocked).toEqual([{ ghostId: G, reason: 'host', url: 'https://example.com/' }]);
  });

  it('finishes with counts and haunted ids', () => {
    const counts = { haunted: 1, flaky: 0, inconclusive: 0, clean: 1, notApplicable: 0, uncompilable: 0 };
    const s = reduceLive(foldLive(race), { type: 'run.finished', t: 9, runId: 'r1', counts, haunted: ['3.2'], durationMs: 5 });
    expect(s).toMatchObject({ phase: 'finished', counts, haunted: ['3.2'] });
  });

  it('returns the same state for an unknown event type', () => {
    const s = foldLive(race);
    expect(reduceLive(s, { type: 'from.the.future', t: 1 } as unknown as LiveMessage)).toBe(s);
  });

  it('ignores steps and frames of an unknown ghost', () => {
    const s = foldLive(race);
    expect(reduceLive(s, { type: 'ghost.step', t: 1, ghostId: 'nope', index: 0, step: 'goto', outcome: 'ok' })).toEqual(s);
    expect(reduceLive(s, { type: 'ghost.frame', t: 1, ghostId: 'nope', seq: 0, jpegBase64: '' })).toEqual(s);
  });

  it('never mutates its input', () => {
    const frozen = deepFreeze(foldLive(race));
    const more: LiveMessage[] = [...race, { type: 'verdict.criterion', t: 9, criterion: '3.2', verdict: 'haunted' }, { type: 'rep.finished', t: 9, rep: 1, outcomes: { completed: 1, timeout: 0, planError: 0, systemError: 0 } }];
    expect(() => more.reduce(reduceLive, frozen)).not.toThrow();
  });

  it('folds like a left reduce', () => {
    expect(foldLive(race)).toEqual(race.reduce(reduceLive, initialLiveState()));
  });

  it('pads frame paths to five digits', () => {
    expect(framePath('g', 42)).toBe('frames/g/00042.jpg');
  });
});
