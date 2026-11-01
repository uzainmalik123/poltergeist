import { resolve } from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

export const USAGE = `usage: poltergeist-mcp [--root <dir>]

Stdio MCP server for Kiro (and other MCP clients). Tools: list_criteria, summon_ghosts,
get_run_status, get_haunting_report, rehaunt. Paths the agent passes resolve against
--root (default: the current directory) and must stay inside it.
`;

export type McpArgs = { command: 'serve'; root: string } | { command: 'help' };

export function parseMcpArgs(argv: readonly string[], cwd: string = process.cwd()): McpArgs {
  const { values } = parseArgs({ args: [...argv], options: { root: { type: 'string' }, help: { type: 'boolean' } }, strict: true, allowPositionals: false });
  if (values.help) return { command: 'help' };
  return { command: 'serve', root: resolve(cwd, values.root ?? '.') };
}

/** `poltergeist-mcp`: serves until stdin closes or a signal arrives, then aborts any active run. */
export async function runStdio(argv: readonly string[]): Promise<number> {
  let args: McpArgs;
  try {
    args = parseMcpArgs(argv);
  } catch (err) {
    process.stderr.write(`poltergeist-mcp: ${err instanceof Error ? err.message : String(err)}\n${USAGE}`);
    return 2;
  }
  if (args.command === 'help') {
    // stdout is fine here: no protocol session is running.
    process.stdout.write(USAGE);
    return 0;
  }
  const { server, runs } = createServer({ root: args.root });
  const transport = new StdioServerTransport();
  let closing: Promise<void> | undefined;
  const shutdown = () =>
    (closing ??= (async () => {
      await runs.abortAll();
      await server.close();
    })());
  const closed = new Promise<void>((r) => {
    transport.onclose = () => r();
    process.stdin.once('end', () => r());
    process.once('SIGINT', () => r());
    process.once('SIGTERM', () => r());
  });
  await server.connect(transport);
  await closed;
  await shutdown();
  return 0;
}
