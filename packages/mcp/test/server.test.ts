import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { SummonOptions, SummonResult } from '@poltergeist/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MAX_TEXT } from '../src/format.js';
import { createServer } from '../src/server.js';

const TOOLS = ['get_haunting_report', 'get_run_status', 'list_criteria', 'rehaunt', 'summon_ghosts'];

let root: string;
const spec = (n: number) =>
  `# Requirements Document\n\n## Requirements\n\n### Requirement 1: Big\n\n#### Acceptance Criteria\n\n${Array.from(
    { length: n },
    (_, i) => `${i + 1}. WHEN the user opens page ${i + 1}, THE System SHALL show ${'a very long description '.repeat(4)}.`,
  ).join('\n')}\n`;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'mcp-server-'));
  for (const [name, n] of [['small', 2], ['big', 300]] as const) {
    await mkdir(join(root, 'app', '.kiro', 'specs', name), { recursive: true });
    await writeFile(join(root, 'app', '.kiro', 'specs', name, 'requirements.md'), spec(n));
  }
  await writeFile(join(root, 'app', 'poltergeist.config.json'), '{}');
});
afterAll(() => rm(root, { recursive: true, force: true }));

function fakeSummon() {
  const calls: SummonOptions[] = [];
  let resolve!: (r: SummonResult) => void;
  const summon = (opts: SummonOptions) => {
    calls.push(opts);
    return new Promise<SummonResult>((r) => (resolve = r));
  };
  const finish = () => {
    const o = calls.at(-1)!;
    resolve({
      runId: o.runId!, runDir: '', specDir: '', target: '', criteria: [{ id: '1.1' }], compiled: [],
      verdicts: { reps: 1, threshold: 1, pairs: [], counts: {}, criteria: [{ criterion: '1.1', verdict: 'haunted', personas: {} }] },
      haunted: ['1.1'], allResetsFailed: false,
      reportPaths: { markdownPath: join(root, 'app/.kiro/specs/small/haunting-report.md'), jsonPath: '' },
    } as unknown as SummonResult);
  };
  return { summon, calls, finish };
}

async function connect(summon = fakeSummon().summon) {
  const { server } = createServer({ root, summon, log: () => undefined });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(b);
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
    return { isError: r.isError ?? false, text: r.content[0]!.text };
  };
  return { client, call };
}

const small = 'app/.kiro/specs/small';

describe('MCP server', () => {
  it('lists exactly the five tools, with Kiro-safe names and descriptions', async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(TOOLS);
    for (const t of tools) {
      expect(t.name).toMatch(/^[a-zA-Z][a-zA-Z0-9_]*$/);
      expect(t.description?.length).toBeGreaterThan(20);
    }
  });

  it('list_criteria returns ids, text and kind', async () => {
    const { call } = await connect();
    const r = await call('list_criteria', { specDir: small });
    expect(r.isError).toBe(false);
    const body = JSON.parse(r.text);
    expect(body.total).toBe(2);
    expect(body.criteria[0]).toMatchObject({ id: '1.1', kind: 'event' });
    expect(body.criteria[0].text.length).toBeLessThanOrEqual(200);
  });

  it('list_criteria stays under the cap on a huge spec', async () => {
    const { call } = await connect();
    const r = await call('list_criteria', { specDir: 'app/.kiro/specs/big' });
    expect(r.text.length).toBeLessThanOrEqual(MAX_TEXT);
    const body = JSON.parse(r.text);
    expect(body.total).toBe(300);
    expect(body.truncated).toBeGreaterThan(0);
    expect(body.criteria.length + body.truncated).toBe(300);
  });

  it('rejects paths outside root', async () => {
    const { call } = await connect();
    const r = await call('list_criteria', { specDir: '../outside' });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/^PathError/);
  });

  it('rejects unknown personas before starting anything', async () => {
    const f = fakeSummon();
    const { call } = await connect(f.summon);
    const r = await call('summon_ghosts', { specDir: small, personas: ['ghost'] });
    expect(r.isError).toBe(true);
    expect(r.text).toContain('ghost');
    expect(f.calls).toHaveLength(0);
  });

  it('summon_ghosts returns running at waitMs 0, then get_run_status finishes it', async () => {
    const f = fakeSummon();
    const { call } = await connect(f.summon);
    const started = JSON.parse((await call('summon_ghosts', { specDir: small, waitMs: 0 })).text);
    expect(started.status).toBe('running');
    expect(f.calls[0]).toMatchObject({ specDir: join(root, small), configPath: join(root, 'app', 'poltergeist.config.json'), cwd: root });
    const busy = await call('summon_ghosts', { specDir: small, waitMs: 0 });
    expect(busy.isError).toBe(true);
    expect(busy.text).toContain(started.runId);
    f.finish();
    const done = JSON.parse((await call('get_run_status', { runId: started.runId, waitMs: 1000 })).text);
    expect(done).toMatchObject({ status: 'finished', haunted: ['1.1'] });
  });

  it('get_run_status on an unknown id is an error that says what to do', async () => {
    const { call } = await connect();
    const r = await call('get_run_status', { runId: 'nope' });
    expect(r.isError).toBe(true);
    expect(r.text).toContain('summon_ghosts');
  });

  it('rehaunt rejects unknown criterion ids up front and passes only for known ones', async () => {
    const f = fakeSummon();
    const { call } = await connect(f.summon);
    const bad = await call('rehaunt', { specDir: small, ids: ['9.9'] });
    expect(bad.isError).toBe(true);
    expect(bad.text).toContain('9.9');
    expect(f.calls).toHaveLength(0);
    await call('rehaunt', { specDir: small, ids: ['1.2'], waitMs: 0 });
    expect(f.calls[0]!.only).toEqual(['1.2']);
  });

  it('rejects waitMs above 100000', async () => {
    const { call } = await connect();
    expect((await call('summon_ghosts', { specDir: small, waitMs: 200_000 })).isError).toBe(true);
  });

  it('get_haunting_report before any run says to summon first', async () => {
    const { call } = await connect();
    const r = await call('get_haunting_report', { specDir: small });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/^NoReportError.*summon_ghosts/);
  });
});
