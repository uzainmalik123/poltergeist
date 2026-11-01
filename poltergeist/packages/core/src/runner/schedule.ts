export type Job<T> = { keys: readonly string[]; slots: number; run: () => Promise<T> };

/**
 * Runs jobs with at most `capacity` slots busy (D-07: one slot per browser context) and never two jobs
 * that share a key at once (KI-13, D-33). Queued jobs start in order whenever their keys are free and
 * their slots fit, so a blocked job never holds back a later free one. A job larger than capacity is
 * clamped. After `signal` aborts, nothing new starts: queued jobs reject with its reason and running
 * ones finish. Results come back in input order.
 */
export function runScheduled<T>(jobs: readonly Job<T>[], capacity: number, signal?: AbortSignal): Promise<PromiseSettledResult<T>[]> {
  if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError(`capacity must be an integer >= 1, got ${capacity}`);
  const results: PromiseSettledResult<T>[] = new Array(jobs.length);
  const queue = jobs.map((_, i) => i);
  const busy = new Map<string, number>();
  let free = capacity;
  let running = 0;

  return new Promise((resolve) => {
    const finishIfDone = () => {
      if (running === 0 && queue.length === 0) resolve(results);
    };

    const pump = () => {
      if (signal?.aborted) {
        for (const i of queue.splice(0)) results[i] = { status: 'rejected', reason: signal.reason };
        finishIfDone();
        return;
      }
      for (let q = 0; q < queue.length; ) {
        const i = queue[q]!;
        const job = jobs[i]!;
        const slots = Math.min(Math.max(1, job.slots), capacity);
        if (slots > free || job.keys.some((k) => busy.has(k))) {
          q++;
          continue;
        }
        queue.splice(q, 1);
        start(i, job, slots);
      }
      finishIfDone();
    };

    const start = (i: number, job: Job<T>, slots: number) => {
      free -= slots;
      running++;
      for (const k of job.keys) busy.set(k, (busy.get(k) ?? 0) + 1);
      let p: Promise<T>;
      try {
        p = Promise.resolve(job.run());
      } catch (err) {
        p = Promise.reject(err);
      }
      p.then(
        (value) => (results[i] = { status: 'fulfilled', value }),
        (reason: unknown) => (results[i] = { status: 'rejected', reason }),
      ).finally(() => {
        free += slots;
        running--;
        for (const k of job.keys) {
          const n = busy.get(k)! - 1;
          if (n === 0) busy.delete(k);
          else busy.set(k, n);
        }
        pump();
      });
    };

    signal?.addEventListener('abort', pump, { once: true });
    pump();
  });
}
