import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Redactor } from '../config/redact.js';
import type { RunEvent, RunEventInput } from './types.js';

export type EventSink = {
  emit(e: RunEventInput): void;
  frame(ghostId: string, jpeg: Buffer): void;
  /** Waits for every pending write; rethrows the first write error. */
  flush(): Promise<void>;
};

/**
 * Fans run events out to `onEvent` and appends them to `<outDir>/events.ndjson` (design §8). Frames go to
 * `onEvent` and `<outDir>/frames/<ghostId>/<seq>.jpg`, never to ndjson. Every event is redacted (Req 2.8),
 * and a throwing listener is swallowed.
 */
export function createEventSink(opts: {
  outDir?: string;
  redactor: Redactor;
  onEvent?: (e: RunEvent) => void;
  now?: () => number;
}): EventSink {
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

  const deliver = (e: RunEvent) => {
    try {
      onEvent?.(e);
    } catch {
      // A broken listener must never stop the run.
    }
  };

  return {
    emit(input) {
      const line = redactor.redact(JSON.stringify({ ...input, t: now() }));
      deliver(JSON.parse(line) as RunEvent);
      if (outDir) write(() => appendFile(join(outDir, 'events.ndjson'), `${line}\n`));
    },
    frame(ghostId, jpeg) {
      const seq = seqs.get(ghostId) ?? 0;
      seqs.set(ghostId, seq + 1);
      deliver({ type: 'ghost.frame', ghostId, seq, jpegBase64: jpeg.toString('base64'), t: now() });
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
