import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Finding } from './check.js';
import { runCandyCheck } from './run.js';

/** `npm run candy:check [fixtureDir]`: F10's Done-when (D-37). Exit 1 if anything fails. */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const fixtureDir = process.argv[2] ?? join(repoRoot, 'fixtures/candy-swap');

const GLYPH: Record<Finding['level'], string> = { ok: '[ok]', warn: '[??]', fail: '[!!]' };

const findings = await runCandyCheck({ fixtureDir });
for (const f of findings) console.log(`${GLYPH[f.level]} ${f.check}: ${f.message}`);

if (findings.some((f) => f.level === 'fail')) {
  process.exitCode = 1;
} else {
  console.log(`
F10 Done-when passed. Next, with Candy Swap running (npm run --prefix fixtures/candy-swap dev):
  KI-30  scout http://localhost:4000 and check the Claim buttons and trade-form fields resolve
  KI-34  doppler run -- npm run summon   (live compile; also covers KI-36 and KI-42)`);
}
