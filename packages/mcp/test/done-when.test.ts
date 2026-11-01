import { relative } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeClaimsProject, type ClaimsProject } from '../../core/test/summon/project-fixture.js';
import { MAX_TEXT } from '../src/format.js';
import { createServer } from '../src/server.js';

// PRD F11 Done-when, fixture-first (D-38): the agent's loop over MCP on the claims fixture with a
// fake LLM. The real loop in a Kiro session on Candy Swap is KI-46.

let project: ClaimsProject;
beforeAll(async () => {
  project = await makeClaimsProject();
});
afterAll(async () => project?.close());

describe('F11 Done-when (fixture)', () => {
  it('runs list → summon → report → rehaunt with agent-sized results', async () => {
    const { server } = createServer({
      root: project.root,
      env: project.env,
      log: () => undefined,
      summonOverrides: { llm: project.llm().client, runOptions: { frameFps: 0 } },
    });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a);
    const client = new Client({ name: 'kiro-like', version: '0' });
    await client.connect(b);
    const texts: string[] = [];
    const call = async (name: string, args: Record<string, unknown>) => {
      const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
      const t = r.content[0]!.text;
      texts.push(t);
      expect(r.isError ?? false, t).toBe(false);
      return t;
    };
    const specDir = relative(project.root, project.specDir);

    const listed = JSON.parse(await call('list_criteria', { specDir }));
    expect(listed.criteria.map((c: { id: string }) => c.id)).toEqual(['3.1', '3.2']);

    const summoned = JSON.parse(await call('summon_ghosts', { specDir, personas: ['wraith', 'doppelganger'], waitMs: 100_000 }));
    expect(summoned).toMatchObject({ status: 'finished', haunted: ['3.2'] });
    expect(summoned.reportPath).toBe(`${specDir}/haunting-report.md`);

    const board = await call('get_haunting_report', { specDir });
    expect(board).toContain('3.2');
    const section = await call('get_haunting_report', { specDir, criterion: '3.2' });
    expect(section).toContain('3.2');
    expect(section).toContain('doppelganger');

    const rehaunted = JSON.parse(await call('rehaunt', { specDir, ids: ['3.1'], personas: ['wraith'], reps: 1, waitMs: 100_000 }));
    expect(rehaunted).toMatchObject({ status: 'finished', haunted: [] });

    for (const t of texts) {
      expect(t.length).toBeLessThanOrEqual(MAX_TEXT);
      // Artifact paths are fine (the report lists them); artifact content never is (Req 10.2).
      expect(t).not.toContain('jpegBase64');
      expect(t).not.toMatch(/[A-Za-z0-9+/]{200,}/);
    }
    await client.close();
  }, 120_000);
});
