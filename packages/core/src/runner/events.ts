import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Redactor } from '../config/redact.js';
import type { DistributiveOmit, RunEvent } from './types.js';

/** `E` is the event union the sink carries: the runner's `RunEvent`, or summon's wider `SummonEvent`. */
export type EventSink<E extends { type: string; t: number } = RunEvent> = {
  emit(e: DistributiveOmit<E, 't'>): void;
  frame(ghostId: string, jpeg: Buffer): void;
  /** Waits for every pending write; rethrows the first write error. */
  flush(): Promise<void>;
};

/**
 * Fans run events out to `onEvent` and appends them to `<outDir>/events.ndjson` (design §8). Frames go to
 * `onEvent` and `<outDir>/frames/<ghostId>/<seq>.jpg`, never to ndjson. Every event is redacted (Req 2.8),
 * and a throwing listener is swallowed.
 */
export function createEventSink<E extends { type: string; t: number } = RunEvent>(opts: {
  outDir?: string;
  redactor: Redactor;
  onEvent?: (e: E) => void;
  now?: () => number;
}): EventSink<E> {
  const { outDir, redactor, onEvent } = opts;
  const now = opts.now ?? Date.now;
  const seqs = new Map<string, number>();
  let chain: Promise<void> = outDir ? mkdir(outDir, { recursive: true }).then(() => undefined) : Promise.resolve();
  let failure: unknown;

  const write = (fn: () => Promise<unknown>) => {
    chain = chain.then(fn).then(
      () => undefined,
      (err: unknown) => {
        failure ??= err;
      },
    );
  };

  const deliver = (e: E) => {
    try {
      onEvent?.(e);
    } catch {
      // A broken listener must never stop the run.
    }
  };

  /** Redacts string values only: scrubbing the serialized line could hit keys, numbers or JSON framing. */
  const scrub = (v: unknown): unknown =>
    typeof v === 'string'
      ? redactor.redact(v)
      : Array.isArray(v)
        ? v.map(scrub)
        : v !== null && typeof v === 'object'
          ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scrub(x)]))
          : v;

  return {
    emit(input) {
      const event = scrub({ ...input, t: now() }) as E;
      deliver(event);
      const line = JSON.stringify(event);
      if (outDir) write(() => appendFile(join(outDir, 'events.ndjson'), `${line}\n`));
    },
    frame(ghostId, jpeg) {
      const seq = seqs.get(ghostId) ?? 0;
      seqs.set(ghostId, seq + 1);
      deliver({ type: 'ghost.frame', ghostId, seq, jpegBase64: jpeg.toString('base64'), t: now() } as unknown as E);
      if (outDir) {
        const dir = join(outDir, 'frames', ghostId);
        write(async () => {
          await mkdir(dir, { recursive: true });
          await writeFile(join(dir, `${String(seq).padStart(5, '0')}.jpg`), jpeg);
        });
      }
    },
    async flush() {
      await chain;
      if (failure !== undefined) throw failure;
    },
  };
}
