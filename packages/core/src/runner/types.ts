import type { ResetResult } from '../config/reset.js';
import type { PersonaId } from '../personas/registry.js';
import type { StepType } from '../personas/steps.js';
import type { BlockReason, BlockedRequest } from '../safety/guard.js';
import type { StorageState } from '../scout/types.js';

export type ActorName = 'a' | 'b';

export type StepOutcome = 'ok' | 'failed' | 'blocked-by-rule' | 'timeout';

export type StepResult = {
  actor: ActorName;
  index: number;
  type: StepType;
  outcome: StepOutcome;
  /** `performance.timeOrigin + performance.now()` when the step started. */
  startedAt: number;
  durationMs: number;
  note?: string;
  error?: string;
};

/** `failure` says whose fault a failed assertion is: the app's, the plan's, or the guard stopped it. */
export type AssertionResult = { index: number; type: string; ok: boolean; detail: string; failure?: 'app' | 'plan' | 'blocked' };

export type RepOutcome = 'completed' | 'timeout' | 'planError' | 'systemError';

/** One pair × rep: the raw result F07 turns into verdicts (D-33). */
export type PairRepResult = {
  criterion: string;
  persona: PersonaId;
  rep: number;
  outcome: RepOutcome;
  error?: string;
  steps: StepResult[];
  assertions: AssertionResult[];
  blocked: BlockedRequest[];
  /** Paths relative to `outDir`. */
  artifacts: string[];
  notes: string[];
  startedAt: number;
  endedAt: number;
};

export type RunOptions = {
  /** Scout's in-memory sessions per account. */
  sessions: ReadonlyMap<string, StorageState>;
  /** The run folder. Without it nothing is written to disk. */
  outDir?: string;
  /** 1…10, default `config.reps`. */
  reps?: number;
  /** A uint32, default `DEFAULT_SEED`. */
  seed?: number;
  /** 0…4, default 4. 0 turns frames off. */
  frameFps?: number;
  /** Contexts at once, 1…20, default `config.concurrency`. */
  concurrency?: number;
  signal?: AbortSignal;
  onEvent?: (e: RunEvent) => void;
  /** Tests only. Default 5000. */
  stepTimeoutMs?: number;
  /** Tests only. Default 60000. */
  planTimeoutMs?: number;
};

export type RunResult = {
  results: PairRepResult[];
  reps: number;
  seed: number;
  resets: (ResetResult | null)[];
  durationMs: number;
};

export type RunEvent = { t: number } & (
  | { type: 'rep.started'; rep: number }
  | { type: 'reset.finished'; rep: number; ok: boolean; durationMs: number; error?: string }
  | { type: 'ghost.spawned'; ghostId: string; criterion: string; persona: PersonaId; rep: number; actor: ActorName }
  | { type: 'ghost.step'; ghostId: string; index: number; step: StepType; outcome: StepOutcome; x?: number; y?: number }
  | { type: 'ghost.frame'; ghostId: string; seq: number; jpegBase64: string }
  | { type: 'guard.blocked'; ghostId: string; reason: BlockReason; url: string }
  | { type: 'assert.result'; criterion: string; persona: PersonaId; rep: number; index: number; ok: boolean; detail: string }
  | { type: 'rep.finished'; rep: number; outcomes: Record<RepOutcome, number> }
);

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type RunEventInput = DistributiveOmit<RunEvent, 't'>;

export const ghostId = (criterion: string, persona: string, rep: number, actor: ActorName): string =>
  `${criterion}__${persona}__r${rep}__${actor}`;
