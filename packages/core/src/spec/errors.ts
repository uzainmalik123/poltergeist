/** Thrown when `requirements.md` is missing or unreadable (Req 1.8). */
export class SpecNotFoundError extends Error {
  override readonly name = 'SpecNotFoundError';

  constructor(
    readonly path: string,
    options?: { cause?: unknown },
  ) {
    super(`Spec not found or unreadable: ${path}`, options);
  }
}
