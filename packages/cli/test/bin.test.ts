import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const BIN = fileURLToPath(new URL('../bin/poltergeist.js', import.meta.url));

function run(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(process.execPath, [BIN, ...args], { env: { ...process.env, NO_COLOR: '1' } }, (err, stdout, stderr) => {
      resolve({ code: err ? ((err as { code?: number }).code ?? 1) : 0, stdout, stderr });
    });
  });
}

describe('poltergeist bin', () => {
  it('--help exits 0', async () => {
    const r = await run(['--help']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('summon');
  }, 30_000);

  it('a missing config exits 2', async () => {
    const r = await run(['summon', '--spec', 'x', '--config', '/nonexistent/poltergeist.json']);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('cannot read');
  }, 30_000);

  it('summon without --spec exits 2', async () => {
    const r = await run(['summon']);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('--spec is required');
  }, 30_000);
});
