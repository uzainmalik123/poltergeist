import type { PersonaId } from '../personas/registry.js';
import type { StepType } from '../personas/steps.js';
import type { ActorName, StepOutcome } from '../runner/types.js';
import type { BlockReason } from '../safety/guard.js';
import type { SummonEvent } from '../summon/types.js';
import type { CriterionVerdict, PairVerdict } from '../verdicts/types.js';

/** The live feed's wire version (D-40). Bump on a breaking change to `LiveMessage` or `LiveState`. */
export const LIVE_PROTOCOL = 1;

/** The event server's first message to every client. */
export type LiveHello = { type: 'live.hello'; protocol: number; runId: string; t: number };

export type LiveMessage = SummonEvent | LiveHello;

/** `waiting` (`[  ]`) → `running` (`[..]`) → the criterion's verdict. */
export type LineStatus = 'waiting' | 'running' | CriterionVerdict;

export type LiveFailure = { persona: PersonaId; rep: number; index: number; detail: string; ghostIds: string[] };

/** One requirement-board line. `evidence.frame` is relative to `LiveState.runDir`. */
export type LiveLine = { id: string; status: LineStatus; failures: LiveFailure[]; evidence?: { ghostId: string; frame?: string } };

/** One ghost tile: what Reanimator draws a minion from. */
export type LiveGhost = {
  ghostId: string;
  criterion: string;
  persona: PersonaId;
  rep: number;
  actor: ActorName;
  step?: StepType;
  stepIndex?: number;
  outcome?: StepOutcome;
  x?: number;
  y?: number;
  frame?: { seq: number; jpegBase64: string };
  done: boolean;
};

export type LiveState = {
  protocol?: number;
  runId?: string;
  runDir?: string;
  target?: string;
  phase: 'idle' | 'scouting' | 'compiling' | 'running' | 'finished';
  rep: number;
  reps: number;
  lines: LiveLine[];
  ghosts: Record<string, LiveGhost>;
  blocked: { ghostId: string; reason: BlockReason; url: string }[];
  counts?: Record<PairVerdict, number>;
  haunted: string[];
};
