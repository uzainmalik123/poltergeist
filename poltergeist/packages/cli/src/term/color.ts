import { oneLine } from '@poltergeist/core';

export type Tone = 'ink' | 'dim' | 'ecto' | 'haunted' | 'flaky' | 'unsure';

/** THEME §2 tokens. F26's Costume Kit owns them once it lands (KI-40). */
export const PALETTE: Readonly<Record<Tone, string>> = Object.freeze({
  ink: '#d6d9cc',
  dim: '#69707a',
  ecto: '#7dffb0',
  haunted: '#ff3b5c',
  flaky: '#ffb020',
  unsure: '#8b93a7',
});

/** Colour and animation only on a TTY without `NO_COLOR` (THEME §5). */
export function colorEnabled(stream: { isTTY?: boolean }, env: NodeJS.ProcessEnv): boolean {
  return stream.isTTY === true && !env.NO_COLOR;
}

/** 24-bit foreground colour, reset to the default foreground after. */
export function paint(text: string, tone: Tone, on: boolean): string {
  if (!on) return text;
  const hex = PALETTE[tone];
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
}

/** Untrusted text for the terminal: one line, controls and bidi made visible as `\uXXXX` (no escapes reach the tty), clipped. */
export function termSafe(s: string, max: number): string {
  return oneLine(s, Math.max(1, max));
}
