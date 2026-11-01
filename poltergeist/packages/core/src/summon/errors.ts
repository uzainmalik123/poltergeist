/** A bad flag or argument: unknown criterion or persona ids, reps out of range, nothing to haunt. Exit code 2 (D-36). */
export class UsageError extends Error {
  readonly exitCode = 2;
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}
