import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { parseConfig } from '@poltergeist/core';
import { runCandyCheck } from './run.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../..');
const REAL_CONFIG = join(repoRoot, 'fixtures/candy-swap/poltergeist.config.json');
const DRAFT_SPEC = join(repoRoot, 'packages/core/test/fixtures/spec/candy-swap-draft/requirements.md');
const ENV = { ...process.env, CANDY_SWAP_PASSWORD: 'boo' };

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

/** A temp stand-in for `fixtures/candy-swap` whose `db:dump` runs `dumpJs` with node. */
async function fakeFixture(dumpJs: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'candy-check-'));
  dirs.push(dir);
  await cp(REAL_CONFIG, join(dir, 'poltergeist.config.json'));
  await mkdir(join(dir, '.kiro/specs/candy-swap'), { recursive: true });
  await cp(DRAFT_SPEC, join(dir, '.kiro/specs/candy-swap/requirements.md'));
  const scripts = { 'db:reset': 'node -e "0"', 'db:dump': `node -e ${JSON.stringify(dumpJs)}` };
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'fake-candy', private: true, scripts }));
  return dir;
}

const fails = (findings: { level: string; check: string }[]) => findings.filter((f) => f.level === 'fail').map((f) => f.check);

describe('runCandyCheck', () => {
  it('reports "not built yet" when the fixture is missing', async () => {
    const findings = await runCandyCheck({ fixtureDir: join(tmpdir(), 'no-such-candy-swap'), env: ENV });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ level: 'fail', check: 'built' });
    expect(findings[0]!.message).toContain('KI-44');
  });

  it('passes a healthy fixture', async () => {
    const dir = await fakeFixture('console.log(JSON.stringify([{id:1}]))');
    const findings = await runCandyCheck({ fixtureDir: dir, env: ENV });
    expect(fails(findings)).toEqual([]);
    expect(findings.map((f) => f.check)).toEqual(
      expect.arrayContaining(['spec-warnings', 'config', 'reset-time', 'reset-deterministic']),
    );
  }, 30_000);

  it('warns, and still checks the config, when CANDY_SWAP_PASSWORD is unset', async () => {
    const dir = await fakeFixture('console.log("[]")');
    const env = { ...process.env };
    delete env.CANDY_SWAP_PASSWORD;
    const findings = await runCandyCheck({ fixtureDir: dir, env });
    expect(findings).toContainEqual(expect.objectContaining({ level: 'warn', check: 'password-env' }));
    expect(findings).toContainEqual(expect.objectContaining({ level: 'ok', check: 'config' }));
  }, 30_000);

  it('fails determinism when the dump changes between resets', async () => {
    const dir = await fakeFixture('console.log(JSON.stringify(process.hrtime.bigint().toString()))');
    expect(fails(await runCandyCheck({ fixtureDir: dir, env: ENV }))).toEqual(['reset-deterministic']);
  }, 30_000);

  it('reports a failing db:dump as a finding instead of throwing', async () => {
    const dir = await fakeFixture('process.exit(1)');
    expect(fails(await runCandyCheck({ fixtureDir: dir, env: ENV }))).toEqual(['dump']);
  }, 30_000);
});

describe('fixtures/candy-swap/poltergeist.config.json', () => {
  it('is a valid config with no warnings', async () => {
    const input: unknown = JSON.parse(await readFile(REAL_CONFIG, 'utf8'));
    const loaded = parseConfig(input, { configPath: REAL_CONFIG, env: { CANDY_SWAP_PASSWORD: 'x' } });
    expect(loaded.warnings).toEqual([]);
    expect(loaded.config.target).toBe('http://localhost:4000');
  });
});
