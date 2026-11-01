export const REDACTED = '[REDACTED]';

/**
 * Scrubs resolved secrets from text (Req 2.8). Every non-empty secret is redacted, however short:
 * safety beats readability. The percent-encoded form is scrubbed too, for secrets that end up in URLs, and
 * the JSON-escaped form, for secrets inside quoted names in aria snapshots.
 */
export class Redactor {
  readonly #secrets: string[];

  constructor(secrets: Iterable<string>) {
    const all = new Set<string>();
    for (const s of secrets) {
      if (s === '') continue;
      all.add(s);
      all.add(encodeURIComponent(s));
      all.add(JSON.stringify(s).slice(1, -1));
    }
    this.#secrets = [...all].sort((a, b) => b.length - a.length);
  }

  get size(): number {
    return this.#secrets.length;
  }

  redact(text: string): string {
    let out = text;
    for (const s of this.#secrets) out = out.split(s).join(REDACTED);
    return out;
  }
}
