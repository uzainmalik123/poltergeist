import process from 'node:process';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { parseSpec, PERSONA_IDS, UsageError, type SummonOptions } from '@poltergeist/core';
import { z } from 'zod';
import { capText, MAX_TEXT, type RunSummary } from './format.js';
import { findConfig, resolveInside } from './paths.js';
import { readReport } from './report.js';
import { RunManager, type SummonFn } from './runs.js';

export type ServerDeps = {
  root: string;
  summonOverrides?: Pick<SummonOptions, 'llm' | 'launch' | 'runOptions'>;
  env?: NodeJS.ProcessEnv;
  /** Defaults to stderr: stdout is the protocol. */
  log?: (msg: string) => void;
  summon?: SummonFn;
};

export const DEFAULT_WAIT_MS = 50_000;
export const MAX_WAIT_MS = 100_000;
const MAX_CRITERION_TEXT = 200;

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean };

const text = (s: string): ToolResult => ({ content: [{ type: 'text', text: capText(s) }] });
const json = (value: unknown): ToolResult => text(JSON.stringify(value));

/** Never throws out of a handler: every failure is an `isError` result the agent can read (D-38). */
async function guarded(log: (msg: string) => void, fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn();
  } catch (err) {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    log(`tool error: ${message}`);
    return { ...text(message), isError: true };
  }
}

const waitMs = z.number().int().min(0).max(MAX_WAIT_MS).optional().describe(`How long to wait for the run to finish, in ms (default ${DEFAULT_WAIT_MS}).`);
const specDir = z.string().min(1).describe('The Kiro spec folder holding requirements.md, relative to the workspace root, e.g. .kiro/specs/checkout.');
const runShape = {
  specDir,
  configPath: z.string().min(1).optional().describe('poltergeist.config.json; default: the nearest one above specDir.'),
  personas: z.array(z.string()).min(1).optional().describe(`Persona ids to run (default all): ${PERSONA_IDS.join(', ')}.`),
  reps: z.number().int().min(1).max(10).optional().describe('Repetitions per test (default from the config).'),
};

/** The stdio MCP server Kiro's agent talks to (Req 10.1–10.2, D-38). */
export function createServer(deps: ServerDeps): { server: McpServer; runs: RunManager } {
  const log = deps.log ?? ((msg: string) => void process.stderr.write(`poltergeist-mcp: ${msg}\n`));
  const { root } = deps;
  const runs = new RunManager({ summon: deps.summon, root, log });
  const server = new McpServer({ name: 'poltergeist', version: '0.0.0' });

  const resolveRun = (input: { specDir: string; configPath?: string; personas?: string[] }) => {
    const dir = resolveInside(root, input.specDir);
    const configPath = input.configPath ? resolveInside(root, input.configPath) : findConfig(dir, root);
    const bad = input.personas?.find((p) => !(PERSONA_IDS as readonly string[]).includes(p));
    if (bad !== undefined) throw new UsageError(`unknown persona: ${bad} (known: ${PERSONA_IDS.join(', ')})`);
    return { specDir: dir, configPath, cwd: root, env: deps.env, ...deps.summonOverrides };
  };
  const startAndWait = async (opts: Parameters<RunManager['start']>[0], wait: number | undefined): Promise<RunSummary> =>
    runs.wait(runs.start(opts), wait ?? DEFAULT_WAIT_MS);

  server.registerTool(
    'list_criteria',
    {
      description: 'Lists the acceptance criteria in a Kiro spec (requirements.md) with their ids, text and EARS kind. Use the ids with rehaunt and get_haunting_report.',
      inputSchema: { specDir },
    },
    (input) =>
      guarded(log, async () => {
        const { criteria } = await parseSpec(resolveInside(root, input.specDir));
        const rows = criteria.map((c) => ({ id: c.id, text: c.text.length > MAX_CRITERION_TEXT ? `${c.text.slice(0, MAX_CRITERION_TEXT - 1)}…` : c.text, kind: c.kind }));
        let body: { criteria: typeof rows; total: number; truncated?: number } = { criteria: rows, total: rows.length };
        while (JSON.stringify(body).length > MAX_TEXT) {
          const kept = body.criteria.slice(0, Math.floor(body.criteria.length * 0.9));
          body = { criteria: kept, total: rows.length, truncated: rows.length - kept.length };
        }
        return json(body);
      }),
  );

  server.registerTool(
    'summon_ghosts',
    {
      description:
        'Runs adversarial browser tests for every acceptance criterion in a Kiro spec against the running app, then writes haunting-report.md into the spec folder. Returns counts and failing criterion ids; if status is "running", call get_run_status with the runId.',
      inputSchema: { ...runShape, recompile: z.boolean().optional().describe('Ignore cached test plans.'), waitMs },
    },
    (input) =>
      guarded(log, async () => json(await startAndWait({ ...resolveRun(input), personas: input.personas, reps: input.reps, recompile: input.recompile }, input.waitMs))),
  );

  server.registerTool(
    'get_run_status',
    {
      description: 'Waits for a run started by summon_ghosts or rehaunt and returns its progress, or its counts and failing criterion ids once finished.',
      inputSchema: { runId: z.string().min(1), waitMs },
    },
    (input) => guarded(log, async () => json(await runs.wait(input.runId, input.waitMs ?? DEFAULT_WAIT_MS))),
  );

  server.registerTool(
    'get_haunting_report',
    {
      description:
        'Reads the latest test report for a spec. Without criterion: the summary board. With criterion: the failing steps, expectations and reasons for that criterion, to guide a fix.',
      inputSchema: { specDir, criterion: z.string().min(1).optional().describe('A criterion id such as 3.2.') },
    },
    (input) => guarded(log, async () => text(await readReport(resolveInside(root, input.specDir), input.criterion))),
  );

  server.registerTool(
    'rehaunt',
    {
      description:
        'Re-runs the tests for only the given criterion ids (for example after a fix) and returns counts and the ids still failing. If status is "running", call get_run_status with the runId.',
      inputSchema: { ...runShape, ids: z.array(z.string().min(1)).min(1).describe('Criterion ids to re-test, e.g. ["3.2"].'), waitMs },
    },
    (input) =>
      guarded(log, async () => {
        const opts = resolveRun(input);
        const { criteria } = await parseSpec(opts.specDir);
        const known = new Set(criteria.map((c) => c.id));
        const bad = input.ids.filter((id) => !known.has(id));
        if (bad.length > 0) throw new UsageError(`unknown criterion id: ${bad.join(', ')}; call list_criteria for the ids`);
        return json(await startAndWait({ ...opts, only: input.ids, personas: input.personas, reps: input.reps }, input.waitMs));
      }),
  );

  return { server, runs };
}
