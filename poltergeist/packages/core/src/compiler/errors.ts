/** The LLM provider refused our credentials (D-32). Aborts the whole compile. Exit code 2. */
export class CompilerError extends Error {
  override readonly name = 'CompilerError';
  readonly exitCode = 2;
  readonly kind = 'auth';

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}
