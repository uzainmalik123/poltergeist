import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseMcpArgs } from '../src/main.js';

const bin = fileURLToPath(new URL('../bin/poltergeist-mcp.js', import.meta.url));

let tmp: string;
beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'mcp-bin-'));
});
afterAll(() => rm(tmp, { recursive: true, force: true }));

describe('parseMcpArgs', () => {
  it('defaults root to cwd and resolves --root', () => {
    expect(parseMcpArgs([], '/w')).toEqual({ command: 'serve', root: '/w' });
    expect(parseMcpArgs(['--root', 'app'], '/w')).toEqual({ command: 'serve', root: '/w/app' });
    expect(parseMcpArgs(['--help'], '/w')).toEqual({ command: 'help' });
  });
  it('rejects unknown flags', () => expect(() => parseMcpArgs(['--bogus'], '/w')).toThrow());
});

describe('poltergeist-mcp bin', () => {
  it('serves the five tools over stdio and exits when the client closes', async () => {
    const transport = new StdioClientTransport({ command: process.execPath, args: [bin, '--root', tmp], stderr: 'pipe' });
    const client = new Client({ name: 'bin-test', version: '0' });
    await client.connect(transport);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['get_haunting_report', 'get_run_status', 'list_criteria', 'rehaunt', 'summon_ghosts']);
    await client.close();
  }, 30_000);

  it('exits non-zero with usage on a bad flag', () => {
    const r = spawnSync(process.execPath, [bin, '--bogus'], { encoding: 'utf8', timeout: 20_000 });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('usage: poltergeist-mcp');
    expect(r.stdout).toBe('');
  }, 30_000);
});
