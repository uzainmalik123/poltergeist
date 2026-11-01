import { z } from 'zod';
import { isValidHostEntry } from '../safety/allowlist.js';

/** A D-15 element target. Lives here until F05's DSL reuses it (D-20). */
export const TargetSchema = z.union([
  z.strictObject({ role: z.string().min(1), name: z.string() }),
  z.strictObject({ label: z.string().min(1) }),
  z.strictObject({ text: z.string().min(1) }),
  z.strictObject({ testId: z.string().min(1) }),
]);
export type Target = z.infer<typeof TargetSchema>;

const routePath = z.string().startsWith('/', 'must start with "/"');

/** Origin only (D-21): http(s), no path, query, hash or userinfo (D-29). */
function originProblem(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return 'must be an absolute http(s) URL';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'must use http or https';
  if (url.username !== '' || url.password !== '') return 'must not contain a username or password';
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    return 'must be an origin only (no path, query or hash)';
  }
  return null;
}

const TargetUrl = z.string().superRefine((value, ctx) => {
  const problem = originProblem(value);
  if (problem) ctx.addIssue({ code: 'custom', message: problem });
});

const AccountSchema = z.strictObject({
  loginRoute: routePath,
  username: z.string().min(1),
  password: z.string().min(1),
  fields: z
    .strictObject({ username: TargetSchema.optional(), password: TargetSchema.optional(), submit: TargetSchema.optional() })
    .optional(),
});

const RouteSchema = z.strictObject({ path: routePath, auth: z.union([z.boolean(), z.string().min(1)]) });

const ForbiddenSchema = z.strictObject({
  method: z.string().regex(/^(\*|[A-Za-z]+)$/, 'must be an HTTP method or "*"'),
  path: routePath,
});

/** `poltergeist.config.json` (D-17, design §3). Unknown keys are errors at every level. */
export const ConfigSchema = z
  .strictObject({
    target: TargetUrl,
    allowedHosts: z
      .array(z.string().refine(isValidHostEntry, 'must be a hostname, IP address or "*.domain"'))
      .default([]),
    routes: z.array(RouteSchema).min(1),
    accounts: z.record(z.string(), AccountSchema).default({}),
    resetCommand: z.string().trim().min(1).optional(),
    resetTimeoutMs: z.int().min(1000).max(600000).default(60000),
    concurrency: z.int().min(1).max(20).default(12),
    reps: z.int().min(1).max(10).default(3),
    forbidden: z.array(ForbiddenSchema).default([]),
    model: z.string().min(1).default('claude-sonnet-5-5'),
  })
  .superRefine((config, ctx) => {
    config.routes.forEach((route, i) => {
      if (route.auth === false) return;
      const name = route.auth === true ? 'default' : route.auth;
      if (!Object.hasOwn(config.accounts, name)) {
        ctx.addIssue({ code: 'custom', path: ['routes', i, 'auth'], message: `account "${name}" is not defined` });
      }
    });
  });

export type Config = z.output<typeof ConfigSchema>;
export type RouteConfig = Config['routes'][number];
export type AccountConfig = Config['accounts'][string];
export type ForbiddenRule = Config['forbidden'][number];
