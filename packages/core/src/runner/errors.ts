import type { BlockedRequest } from '../safety/guard.js';

/** A `leak` guard report: traffic may have left the allowlist, so the whole run stops (D-18, D-33). */
export class RunnerSafetyError extends Error {
  readonly exitCode = 3;

  constructor(readonly blocked: BlockedRequest) {
    super(`run aborted: the network guard could not confirm a request to ${blocked.host} was stopped`);
    this.name = 'RunnerSafetyError';
  }
}
