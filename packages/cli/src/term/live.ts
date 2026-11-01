import type { PersonaId } from '@poltergeist/core';
import { paint, termSafe } from './color.js';

/** THEME §5: `W  wraith  3.2  r1  click`. The ghost (initial and persona) glows; the rest is plain. */
export function ghostLine(e: { persona: PersonaId; criterion: string; rep: number; step?: string }, on: boolean): string {
  const ghost = paint(`${e.persona[0]!.toUpperCase()}  ${e.persona}`, 'ecto', on);
  const rest = `${termSafe(e.criterion, 20)}  r${e.rep}${e.step ? `  ${termSafe(e.step, 40)}` : ''}`;
  return `${ghost}  ${rest}`;
}

/** One line per active ghost, redrawn in place under the cursor. Only used on a colour TTY. */
export class LiveBlock {
  private readonly lines = new Map<string, string>();
  private drawn = 0;

  constructor(
    private readonly out: { write(s: string): void },
    private readonly maxLines: number,
  ) {}

  update(ghostId: string, line: string): void {
    this.lines.set(ghostId, line);
    this.draw();
  }

  remove(ghostId: string): void {
    if (this.lines.delete(ghostId)) this.draw();
  }

  /** Erases the block, leaving the cursor where it started. */
  clear(): void {
    this.out.write(`${this.up()}\x1b[J`);
    this.drawn = 0;
    this.lines.clear();
  }

  private up(): string {
    return this.drawn > 0 ? `\x1b[${this.drawn}F` : '';
  }

  private draw(): void {
    const shown = [...this.lines.values()].slice(-this.maxLines);
    this.out.write(`${this.up()}\x1b[J${shown.map((l) => `${l}\n`).join('')}`);
    this.drawn = shown.length;
  }
}
