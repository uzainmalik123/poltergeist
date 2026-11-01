export type Limiter = {
  <T>(task: () => T | Promise<T>): Promise<T>;
  readonly active: number;
  readonly pending: number;
};

/** A FIFO concurrency limiter (D-07). F06 opens every browser context through one. */
export function createLimiter(n: number): Limiter {
  if (!Number.isInteger(n) || n < 1) throw new RangeError(`concurrency must be an integer >= 1, got ${n}`);
  let active = 0;
  const queue: Array<() => void> = [];

  const release = () => {
    active--;
    queue.shift()?.();
  };

  const limit = <T>(task: () => T | Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const run = () => {
        active++;
        let result: Promise<T>;
        try {
          result = Promise.resolve(task());
        } catch (err) {
          result = Promise.reject(err);
        }
        result.then(resolve, reject).finally(release);
      };
      if (active < n) run();
      else queue.push(run);
    });

  return Object.defineProperties(limit, {
    active: { get: () => active },
    pending: { get: () => queue.length },
  }) as Limiter;
}
