import type { LiveLine, LiveMessage, LiveState } from './types.js';

export const initialLiveState = (): LiveState => ({ phase: 'idle', rep: 0, reps: 0, lines: [], ghosts: {}, blocked: [], haunted: [] });

/** Where `createEventSink` writes a frame, relative to the run folder. */
export const framePath = (ghostId: string, seq: number): string => `frames/${ghostId}/${String(seq).padStart(5, '0')}.jpg`;

/** Replaces line `id` (appending it when unseen, e.g. an `--only` rerun) without touching `lines`. */
function withLine(lines: LiveLine[], id: string, fn: (l: LiveLine) => LiveLine): LiveLine[] {
  const i = lines.findIndex((l) => l.id === id);
  if (i < 0) return [...lines, fn({ id, status: 'waiting', failures: [] })];
  return lines.map((l, j) => (j === i ? fn(l) : l));
}

/**
 * Folds one run event into the live state (PRD F12, D-40). Pure: never mutates `s`, and an event it doesn't know
 * (a newer engine) returns `s` itself. Isomorphic, so a browser can run it on the `--seance` stream.
 */
export function reduceLive(s: LiveState, m: LiveMessage): LiveState {
  switch (m.type) {
    case 'live.hello':
      return { ...s, protocol: m.protocol, runId: m.runId };
    case 'run.started':
      // A new run starts clean (a heal-loop rerun folded into the old state must not keep its ghosts).
      return {
        ...initialLiveState(), protocol: s.protocol, phase: 'scouting', runId: m.runId, runDir: m.runDir, target: m.target, reps: m.reps,
        lines: m.criteria.map((id) => ({ id, status: 'waiting', failures: [] })),
      };
    case 'plan.compiled':
      return s.phase === 'scouting' ? { ...s, phase: 'compiling' } : s;
    case 'rep.started':
      return { ...s, phase: 'running', rep: m.rep };
    case 'ghost.spawned':
      return {
        ...s,
        lines: withLine(s.lines, m.criterion, (l) => (l.status === 'waiting' ? { ...l, status: 'running' } : l)),
        ghosts: { ...s.ghosts, [m.ghostId]: { ghostId: m.ghostId, criterion: m.criterion, persona: m.persona, rep: m.rep, actor: m.actor, done: false } },
      };
    case 'ghost.step': {
      const g = s.ghosts[m.ghostId];
      if (!g) return s;
      return { ...s, ghosts: { ...s.ghosts, [m.ghostId]: { ...g, step: m.step, stepIndex: m.index, outcome: m.outcome, x: m.x ?? g.x, y: m.y ?? g.y } } };
    }
    case 'ghost.frame': {
      const g = s.ghosts[m.ghostId];
      if (!g) return s;
      return { ...s, ghosts: { ...s.ghosts, [m.ghostId]: { ...g, frame: { seq: m.seq, jpegBase64: m.jpegBase64 } } } };
    }
    case 'guard.blocked':
      return { ...s, blocked: [...s.blocked, { ghostId: m.ghostId, reason: m.reason, url: m.url }] };
    case 'assert.result': {
      if (m.ok) return s;
      const ghostIds = Object.values(s.ghosts)
        .filter((g) => g.criterion === m.criterion && g.persona === m.persona && g.rep === m.rep)
        .map((g) => g.ghostId);
      const failure = { persona: m.persona, rep: m.rep, index: m.index, detail: m.detail, ghostIds };
      return { ...s, lines: withLine(s.lines, m.criterion, (l) => ({ ...l, failures: [...l.failures, failure] })) };
    }
    case 'rep.finished':
      return {
        ...s,
        ghosts: Object.fromEntries(Object.entries(s.ghosts).map(([id, g]) => [id, g.rep === m.rep ? { ...g, done: true } : g])),
      };
    case 'verdict.criterion':
      return {
        ...s,
        lines: withLine(s.lines, m.criterion, (l) => {
          if (m.verdict !== 'haunted') return { ...l, status: m.verdict };
          const ghostId = l.failures.flatMap((f) => f.ghostIds).find((id) => s.ghosts[id]);
          if (!ghostId) return { ...l, status: m.verdict };
          const frame = s.ghosts[ghostId]?.frame;
          return { ...l, status: m.verdict, evidence: frame ? { ghostId, frame: framePath(ghostId, frame.seq) } : { ghostId } };
        }),
      };
    case 'run.finished':
      return { ...s, phase: 'finished', counts: m.counts, haunted: m.haunted };
    default:
      return s;
  }
}

export const foldLive = (ms: Iterable<LiveMessage>): LiveState => {
  let s = initialLiveState();
  for (const m of ms) s = reduceLive(s, m);
  return s;
};
