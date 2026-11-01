import { UsageError } from '@poltergeist/core';
import { HELP_TEXT, parseCliArgs } from './args.js';

/** Placeholder until summon is wired in (Task 7). */
export async function main(argv: readonly string[]): Promise<number> {
  try {
    const args = parseCliArgs(argv);
    if (args.command === 'help') {
      process.stdout.write(HELP_TEXT);
      return 0;
    }
    return 2;
  } catch (err) {
    process.stderr.write(`error: ${err instanceof UsageError ? err.message : String(err)}\n`);
    return 2;
  }
}
