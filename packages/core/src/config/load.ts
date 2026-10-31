import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { effectiveHosts, isAllowedHost } from '../safety/allowlist.js';
import { ConfigError, type ConfigIssue } from './errors.js';
import { REDACTED, Redactor } from './redact.js';
import { ConfigSchema, type AccountConfig, type Config } from './schema.js';

export type ConfigWarning = { code: 'literal-password' | 'unresolved-secret'; path: string; message: string };

export type LoadedConfig = {
  /** Defaults applied, passwords resolved, unusable unused accounts removed (D-29). */
  config: Config;
  /** The JSON as written, for `run.json`: `env:NAME` kept, literal passwords replaced with `[REDACTED]`. */
  snapshot: unknown;
  configPath: string;
  configDir: string;
  /** Loopback defaults plus `allowedHosts` (D-05). */
  allowedHosts: string[];
  redactor: Redactor;
  warnings: ConfigWarning[];
  env: NodeJS.ProcessEnv;
};

const DEFAULT_CONFIG_FILE = 'poltergeist.config.json';
const ENV_REF = /^env:([A-Za-z_][A-Za-z0-9_]*)$/;

/** The secret a password field resolves to, or undefined for an unset or empty `env:NAME`. */
function resolvePassword(password: string, env: NodeJS.ProcessEnv): string | undefined {
  const ref = ENV_REF.exec(password);
  if (!ref) return password;
  return env[ref[1] as string] || undefined;
}

/** Secrets read straight from the raw input, so even schema issues can be redacted. */
function rawSecrets(input: unknown, env: NodeJS.ProcessEnv): string[] {
  const accounts = (input as { accounts?: unknown } | null)?.accounts;
  if (typeof accounts !== 'object' || accounts === null) return [];
  const secrets: string[] = [];
  for (const account of Object.values(accounts)) {
    const password = (account as { password?: unknown } | null)?.password;
    if (typeof password !== 'string') continue;
    const secret = resolvePassword(password, env);
    if (secret) secrets.push(secret);
  }
  return secrets;
}

/** A deep copy of the input with literal passwords replaced; `env:NAME` references are kept (design §9). */
function redactLiteralPasswords(input: unknown): unknown {
  const copy = structuredClone(input) as { accounts?: Record<string, { password?: unknown }> };
  for (const account of Object.values(copy.accounts ?? {})) {
    if (typeof account?.password === 'string' && !ENV_REF.test(account.password)) account.password = REDACTED;
  }
  return copy;
}

function usedAccounts(config: Config): Set<string> {
  const used = new Set<string>();
  for (const { auth } of config.routes) if (auth !== false) used.add(auth === true ? 'default' : auth);
  return used;
}

/** Validates an already-parsed config (D-17, D-29). Pure apart from reading `env`; throws `ConfigError`. */
export function parseConfig(input: unknown, opts: { configPath: string; env?: NodeJS.ProcessEnv }): LoadedConfig {
  const env = opts.env ?? process.env;
  const redactor = new Redactor(rawSecrets(input, env));
  const fail = (issues: ConfigIssue[]): never => {
    throw new ConfigError(issues.map((i) => ({ path: redactor.redact(i.path), message: redactor.redact(i.message) })));
  };

  const parsed = ConfigSchema.safeParse(input);
  if (!parsed.success) {
    fail(parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  const config = (parsed as { data: Config }).data;
  const allowedHosts = effectiveHosts(config.allowedHosts);

  const issues: ConfigIssue[] = [];
  const host = new URL(config.target).hostname;
  if (!isAllowedHost(host, allowedHosts)) {
    issues.push({
      path: 'target',
      message: `host "${host}" is not allowlisted; add it to allowedHosts (loopback is allowed by default)`,
    });
  }

  const warnings: ConfigWarning[] = [];
  const used = usedAccounts(config);
  const accounts: Record<string, AccountConfig> = {};
  for (const [name, account] of Object.entries(config.accounts)) {
    const path = `accounts.${name}.password`;
    const ref = ENV_REF.exec(account.password);
    const secret = resolvePassword(account.password, env);
    if (secret === undefined) {
      const message = `environment variable ${ref?.[1]} is not set or empty`;
      if (used.has(name)) issues.push({ path, message });
      else warnings.push({ code: 'unresolved-secret', path, message: `${message}; account "${name}" is unused and was dropped` });
      continue;
    }
    if (!ref) {
      warnings.push({ code: 'literal-password', path, message: 'literal password; prefer "env:NAME" for anything but fake demo accounts' });
    }
    accounts[name] = { ...account, password: secret };
  }
  if (issues.length > 0) fail(issues);

  const configPath = opts.configPath;
  return {
    config: { ...config, accounts },
    snapshot: redactLiteralPasswords(input),
    configPath,
    configDir: dirname(configPath),
    allowedHosts,
    redactor,
    warnings: warnings.map((w) => ({ ...w, message: redactor.redact(w.message) })),
    env,
  };
}

/** Where V8 says the JSON broke, from the numbers in its message only (never its quoted source text). */
function jsonErrorLocation(message: string): string {
  const lineCol = /line (\d+) column (\d+)/.exec(message);
  if (lineCol) return ` at line ${lineCol[1]}, column ${lineCol[2]}`;
  const position = /position (\d+)/.exec(message);
  return position ? ` at position ${position[1]}` : '';
}

/** Reads `--config` or `./poltergeist.config.json` and validates it. Throws `ConfigError` (exit code 2). */
export async function loadConfig(
  opts: { path?: string; cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<LoadedConfig> {
  const configPath = resolve(opts.cwd ?? process.cwd(), opts.path ?? DEFAULT_CONFIG_FILE);
  let text: string;
  try {
    text = await readFile(configPath, 'utf8');
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException).code ?? 'unknown error';
    throw new ConfigError([{ path: '', message: `cannot read ${configPath}: ${code}` }], { cause });
  }
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch (e) {
    // V8's message quotes the source around the error, which may be an unquoted password: never echo it.
    throw new ConfigError([{ path: '', message: `invalid JSON in ${configPath}${jsonErrorLocation((e as Error).message)}` }]);
  }
  return parseConfig(input, { configPath, env: opts.env });
}
