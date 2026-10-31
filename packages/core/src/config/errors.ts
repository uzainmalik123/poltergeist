/** One validation problem, with a dot-joined field path (`''` for the root). */
export type ConfigIssue = { path: string; message: string };

/** A bad or refused config (Req 2.1–2.3, 2.6, 2.8). The CLI maps it to exit code 2. */
export class ConfigError extends Error {
  override readonly name = 'ConfigError';
  readonly exitCode = 2;

  constructor(
    readonly issues: ConfigIssue[],
    options?: { cause?: unknown },
  ) {
    super(
      ['Invalid poltergeist config:', ...issues.map((i) => `  ${i.path || '(root)'}: ${i.message}`)].join('\n'),
      options,
    );
  }
}

export type ResetErrorKind = 'exit' | 'timeout' | 'spawn';

/** `resetCommand` failed or timed out (Req 2.7): a system error, never an app bug. Exit code 2. */
export class ResetError extends Error {
  override readonly name = 'ResetError';
  readonly exitCode = 2;
  readonly code: number | null;
  readonly signal: string | null;
  readonly outputTail: string;

  constructor(
    readonly kind: ResetErrorKind,
    message: string,
    details: { code: number | null; signal: string | null; outputTail: string },
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.code = details.code;
    this.signal = details.signal;
    this.outputTail = details.outputTail;
  }
}
