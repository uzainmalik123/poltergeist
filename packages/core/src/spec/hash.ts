import { createHash } from 'node:crypto';

/** NFC, whitespace collapsed to single spaces, trimmed, case kept (D-16). */
export function normalizeText(s: string): string {
  return s.normalize('NFC').replace(/\s+/g, ' ').trim();
}

/** First 12 hex characters of sha256 over the normalized text (D-16, Req 1.6). */
export function criterionHash(text: string): string {
  return createHash('sha256').update(normalizeText(text)).digest('hex').slice(0, 12);
}
