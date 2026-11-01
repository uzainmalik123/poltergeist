export type EarsKind = 'event' | 'state' | 'unwanted' | 'optional' | 'ubiquitous';

export type EarsClauses = {
  kind: EarsKind;
  trigger?: string;
  precondition?: string;
  subject?: string;
  response: string;
};

export type Criterion = {
  /** `N.M`, e.g. `3.2` or `3b.1` (D-16). */
  id: string;
  /** The requirement's title, e.g. `Reading specs`. */
  requirement: string;
  /** `N` with its duplicate suffix, e.g. `3` or `3b`. */
  requirementId: string;
  /** Normalized plain text. */
  text: string;
  /** The criterion's source markdown. */
  raw: string;
  /** 1-based line in requirements.md. */
  line: number;
  kind: EarsKind | 'freeform';
  ears: EarsClauses | null;
  /** First 12 hex of sha256 over `text`. */
  hash: string;
};

export type SpecWarningCode =
  | 'empty-spec'
  | 'no-criteria'
  | 'ignored-list'
  | 'unrecognized-heading'
  | 'duplicate-requirement'
  | 'no-requirement-headings';

export type SpecWarning = { code: SpecWarningCode; message: string; line?: number };

export type ParsedSpec = { criteria: Criterion[]; warnings: SpecWarning[] };
