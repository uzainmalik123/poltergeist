import { parseArgs } from 'node:util';
import { UsageError } from '@poltergeist/core';

export type CliArgs =
  | { command: 'help' }
  | {
      command: 'summon';
      spec: string;
      config?: string;
      only?: string[];
      personas?: string[];
      reps?: number;
      recompile: boolean;
      seance: boolean;
    };

export const HELP_TEXT = `poltergeist: haunt a Kiro spec with adversarial ghosts

Usage:
  poltergeist summon --spec <dir> [options]

Options:
  --spec <dir>        spec folder holding requirements.md (required)
  --config <path>     config file (default ./poltergeist.config.json)
  --only <ids>        only these criteria, comma-separated (e.g. 3.2,4.1)
  --personas <ids>    only these personas, comma-separated (e.g. wraith,doppelganger)
  --reps <n>          repetitions per plan, 1-10 (default from config)
  --recompile         ignore cached plans and compile again
  --seance            stream run events on ws://127.0.0.1:6660/runs/<id>
  -h, --help          show this help

Exit codes:
  0  nothing haunted
  1  at least one criterion haunted
  2  usage, configuration or system error
`;

const list = (flag: string, value: string | undefined): string[] | undefined => {
  if (value === undefined) return undefined;
  const ids = value.split(',').map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) throw new UsageError(`${flag} needs at least one id`);
  return ids;
};

/** Parses `poltergeist` arguments (D-36). Throws `UsageError` for anything it can't accept. */
export function parseCliArgs(argv: readonly string[]): CliArgs {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: {
        spec: { type: 'string' },
        config: { type: 'string' },
        only: { type: 'string' },
        personas: { type: 'string' },
        reps: { type: 'string' },
        recompile: { type: 'boolean', default: false },
        seance: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    });
  } catch (err) {
    throw new UsageError(err instanceof Error ? err.message : String(err));
  }
  const { values, positionals } = parsed;
  const [command, ...rest] = positionals;
  if (values.help || command === undefined || command === 'help') return { command: 'help' };
  if (command !== 'summon') throw new UsageError(`unknown command: ${command}`);
  if (rest.length) throw new UsageError(`unexpected argument: ${rest[0]}`);
  if (values.spec === undefined) throw new UsageError('--spec is required');

  let reps: number | undefined;
  if (values.reps !== undefined) {
    reps = /^\d+$/.test(values.reps) ? Number(values.reps) : NaN;
    if (!Number.isInteger(reps) || reps < 1 || reps > 10) throw new UsageError(`--reps must be an integer 1–10, got ${values.reps}`);
  }
  const only = list('--only', values.only);
  const personas = list('--personas', values.personas);
  return {
    command: 'summon',
    spec: values.spec,
    ...(values.config !== undefined ? { config: values.config } : {}),
    ...(only ? { only } : {}),
    ...(personas ? { personas } : {}),
    ...(reps !== undefined ? { reps } : {}),
    recompile: values.recompile,
    seance: values.seance,
  };
}
