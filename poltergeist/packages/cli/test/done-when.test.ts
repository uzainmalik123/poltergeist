import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SummonEvent } from '@poltergeist/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { makeClaimsProject, type ClaimsProject } from '../../core/test/summon/project-fixture.js';
import { main, type MainDeps } from '../src/main.js';

// PRD F09 Done-when, fixture-first (D-36). The real Candy Swap run from a clean clone is KI-42.

let project: ClaimsProject;
beforeAll(async () => {
  project = await makeClaimsProject();
});
afterAll(async () => project?.close());

function capture() {
  const out = { stdout: '', stderr: '' };
  const listeners: ((s: string) => void)[] = [];
  const deps: MainDeps = {
    stdout: { write: (s) => { out.stdout += s; for (const l of listeners) l(s); }, isTTY: false, columns: 100 },
    stderr: { write: (s) => void (out.stderr += s) },
    env: { ...project.env, NO_COLOR: '1' },
    summonOverrides: { llm: project.llm().client, runOptions: { frameFps: 0 } },
  };
  return { out, deps, onStdout: (l: (s: string) => void) => listeners.push(l) };
}

const summonArgs = (...extra: string[]) => ['summon', '--spec', project.specDir, '--config', project.configPath, '--personas', 'wraith,doppelganger', ...extra];

describe('F09 Done-when (fixture)', () => {
  it('runs the whole haunting, prints the board and exits 1 on a haunted criterion', async () => {
    const { out, deps } = capture();
    const code = await main(summonArgs(), deps);
    expect(out.stderr).toBe('');
    expect(code).toBe(1);
    expect(out.stdout).toContain('╔═╗╔═╗╦  ╔╦╗');
    expect(out.stdout).toContain('[!!] 3.2');
    expect(out.stdout).toContain('[ok] 3.1');
    expect(out.stdout).toContain('report: ');
    expect(out.stdout).not.toContain('\x1b');
    expect(existsSync(join(project.specDir, 'haunting-report.md'))).toBe(true);
  }, 120_000);

  it('streams events with --seance', async () => {
    const { out, deps, onStdout } = capture();
    const types: string[] = [];
    let finished!: () => void;
    const done = new Promise<void>((r) => (finished = r));
    onStdout((s) => {
      const url = /(ws:\/\/127\.0\.0\.1:\d+\/runs\/\S+)/.exec(s)?.[1];
      if (!url) return;
      const ws = new WebSocket(url);
      ws.on('message', (data) => {
        const e = JSON.parse(String(data)) as SummonEvent;
        types.push(e.type);
        if (e.type === 'run.finished') finished();
      });
    });
    const code = await main(summonArgs('--seance', '--only', '3.1', '--reps', '1'), { ...deps, seancePort: 0 });
    expect(code, out.stderr).toBe(0);
    await done;
    expect(types[0]).toBe('run.started');
    expect(types).toContain('run.finished');
  }, 120_000);

  it('exits 0 when only clean criteria run', async () => {
    const { deps } = capture();
    expect(await main(summonArgs('--only', '3.1'), deps)).toBe(0);
  }, 120_000);

  it('exits 2 on a broken config', async () => {
    const bad = join(project.root, 'broken.json');
    await writeFile(bad, '{');
    const { out, deps } = capture();
    expect(await main(['summon', '--spec', project.specDir, '--config', bad], deps)).toBe(2);
    expect(out.stderr).toMatch(/error:/);
  });

  it('exits 2 on a usage error and points at --help', async () => {
    const { out, deps } = capture();
    expect(await main(['summon', '--spec', project.specDir, '--config', project.configPath, '--only', '9.9'], deps)).toBe(2);
    expect(out.stderr).toMatch(/unknown criterion id: 9\.9/);
    expect(out.stderr).toMatch(/poltergeist --help/);
  });

  it('exits 2 before any work when the --seance port is taken', async () => {
    const { WebSocketServer } = await import('ws');
    const blocker = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await new Promise((r) => blocker.once('listening', r));
    const port = (blocker.address() as { port: number }).port;
    try {
      const { out, deps } = capture();
      expect(await main(summonArgs('--seance'), { ...deps, seancePort: port })).toBe(2);
      expect(out.stderr).toMatch(new RegExp(`port ${port} is in use`));
      expect(out.stdout).not.toContain('scout');
    } finally {
      await new Promise((r) => blocker.close(r));
    }
  });

  it('exits 130 on abort without writing a report', async () => {
    const fresh = await makeClaimsProject();
    try {
      const { deps } = capture();
      const ac = new AbortController();
      ac.abort(new DOMException('aborted', 'AbortError'));
      const code = await main(['summon', '--spec', fresh.specDir, '--config', fresh.configPath], { ...deps, env: { ...fresh.env, NO_COLOR: '1' }, signal: ac.signal });
      expect(code).toBe(130);
      expect(existsSync(join(fresh.specDir, 'haunting-report.md'))).toBe(false);
    } finally {
      await fresh.close();
    }
  }, 60_000);

  it('prints help and exits 0', async () => {
    const { out, deps } = capture();
    expect(await main(['--help'], deps)).toBe(0);
    expect(out.stdout).toContain('--spec');
  });
});
