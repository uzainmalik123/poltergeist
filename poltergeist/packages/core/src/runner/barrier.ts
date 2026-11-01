import type { ActorName } from './types.js';

type Waiting = { arrived: Set<ActorName>; resolvers: ((r: 'released' | 'broken') => void)[] };

/**
 * In-process rendezvous for a plan's actors (Req 6.3, D-33). A barrier releases every waiting actor in
 * the same tick once all live actors arrive. An actor that ends before reaching a barrier breaks it, so
 * the others never wait for the plan timeout.
 */
export class BarrierSet {
  readonly #actors: readonly ActorName[];
  readonly #left = new Set<ActorName>();
  readonly #waiting = new Map<string, Waiting>();
  readonly #releases = new Map<string, number>();

  constructor(actors: readonly ActorName[]) {
    this.#actors = actors;
  }

  /** Barrier name → `performance.now()` when it released. */
  get releases(): ReadonlyMap<string, number> {
    return this.#releases;
  }

  arrive(name: string, actor: ActorName): Promise<'released' | 'broken'> {
    if (this.#left.size > 0) return Promise.resolve('broken');
    const w = this.#waiting.get(name) ?? { arrived: new Set<ActorName>(), resolvers: [] };
    this.#waiting.set(name, w);
    w.arrived.add(actor);
    const p = new Promise<'released' | 'broken'>((resolve) => w.resolvers.push(resolve));
    if (this.#actors.every((a) => w.arrived.has(a))) {
      this.#waiting.delete(name);
      this.#releases.set(name, performance.now());
      for (const r of w.resolvers) r('released');
    }
    return p;
  }

  leave(actor: ActorName): void {
    this.#left.add(actor);
    for (const [name, w] of this.#waiting) {
      this.#waiting.delete(name);
      for (const r of w.resolvers) r('broken');
    }
  }
}
