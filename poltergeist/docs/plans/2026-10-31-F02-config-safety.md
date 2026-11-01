# F02 Target Config & Safety Allowlist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `@poltergeist/core` can load and validate `poltergeist.config.json`, refuse non-allowlisted targets, redact secrets, run the reset command, limit concurrency, and launch Chromium contexts that cannot reach any host outside the allowlist (Requirement 2).

**Architecture:** Two folders. `src/config/` is pure Node: a strict zod schema, a loader that resolves `env:NAME` secrets into a `Redactor`, and `runReset`. `src/safety/` holds the hostname allowlist, the precompiled `forbidden` matcher, the limiter, and the network guard: a dead local proxy (bypass `<-loopback>` + allowlist) as the backstop, `context.route`/`routeWebSocket` for reporting and `forbidden`, and `requestfailed`/`requestfinished` classification for redirect hops (D-18, D-22). The guard is tested against real headless Chromium and a local `node:http` fixture; nothing touches the internet.

**Tech Stack:** TypeScript 5.9.3, Node ≥ 22, zod 4.6.7, playwright-core 1.64.1 (Chromium), ws 8.22.0 (test fixture only, dev), @types/ws 8.18.2, vitest 4.1.12.

**Spec:** `.kiro/specs/poltergeist/requirements.md` Requirement 2 · `design.md` §3 (config), §4 (`BlockReason`), §5 (guard) · `docs/DECISIONS.md` D-05, D-07, D-17, D-18, D-20 (account `fields`), D-21 (origin-only target), D-22, D-29 · `docs/PRD.md` F02 · `docs/LESSONS.md` § F02.

## Global Constraints

- Fresh code only (D-25). Never open `../../../poltergeist-old`.
- Versions pinned exactly (`npm i -E`). Update STACK.md's "Installed here?" column.
- `npm run health` must stay green after every task (D-19). Browser tests need Chromium (`npx playwright-core install chromium`).
- Allowlist defaults `localhost`, `127.0.0.1`, `::1`; `allowedHosts` extends, never replaces (D-05). Bare `*` rejected.
- Concurrency int 1–20, default 12 (D-07). Reps int 1–10, default 3. `resetTimeoutMs` int 1000–600000, default 60000. Model default `claude-sonnet-5-5`.
- `ConfigError` and `ResetError` carry `exitCode: 2`. F02 makes no verdict decisions.
- Redacted text is replaced with `[REDACTED]`.
- `newGuardedContext` is the only way to get a guarded context; the bypass builder and `installNetworkGuard` are not exported from the package index (D-18, D-29).
- Tests live in `packages/core/test/{config,safety}/`, mirroring `src/`. Each folder exports through its `index.ts`; `src/index.ts` re-exports both.

## Review Focus

1. **IPv6 hosts arrive bracketed** (`new URL('http://[::1]:4000').hostname === '[::1]'`); `::1` must still be allowlisted. Pinned in Task 2.
2. **A wildcard `*.example.test` must not allow `example.test` itself or `evilexample.test`.** Pinned in Task 2.
3. **A config file that isn't JSON or doesn't exist** must give a `ConfigError` with a readable message, never a raw `SyntaxError`/`ENOENT`. Pinned in Task 4.
4. **A secret that appears inside a reset command's output split across stdout and stderr chunks** must still be redacted (redact the joined buffer, not chunks). Pinned in Task 6.
5. **A blocked request is reported exactly once** (our own `route.abort` also fires `requestfailed` with `ERR_BLOCKED_BY_CLIENT`). Pinned in Task 7.

---

## File Structure

```
packages/core/package.json            + zod, playwright-core; dev ws, @types/ws
package.json                          + script test:guard:1cpu
.github/workflows/ci.yml              + npx playwright-core install --with-deps chromium
packages/core/src/index.ts            + export * from './config/index.js', './safety/index.js'
packages/core/src/config/schema.ts    ConfigSchema, TargetSchema, Config/… types
packages/core/src/config/errors.ts    ConfigError, ResetError
packages/core/src/config/redact.ts    Redactor
packages/core/src/config/load.ts      parseConfig, loadConfig, LoadedConfig
packages/core/src/config/reset.ts     runReset
packages/core/src/config/index.ts
packages/core/src/safety/allowlist.ts DEFAULT_HOSTS, isValidHostEntry, effectiveHosts, normalizeHost, isAllowedHost
packages/core/src/safety/forbidden.ts compileForbidden
packages/core/src/safety/limiter.ts   createLimiter
packages/core/src/safety/guard.ts     guardLaunchOptions, newGuardedContext, classifyRequestFailure, BlockedRequest
packages/core/src/safety/index.ts
packages/core/test/safety/fixture-server.ts   node:http + ws fixture
```

---

### Task 1: Dependencies and host allowlist

**Files:**
- Modify: `packages/core/package.json`, `.github/workflows/ci.yml`, `docs/STACK.md`
- Create: `packages/core/src/safety/{allowlist.ts,index.ts}`
- Test: `packages/core/test/safety/allowlist.test.ts`

**Interfaces:**
- Produces:
  - `DEFAULT_HOSTS: readonly ['localhost', '127.0.0.1', '::1']`
  - `isValidHostEntry(entry: string): boolean` — true for a DNS name (labels `[a-z0-9-]`, 1–63 chars, not starting/ending with `-`, any case), an IPv4 dotted quad (each 0–255), an IPv6 address per `net.isIPv6` (no brackets), or `*.` + DNS name. False for `*`, `*.`, `a.*.b`, anything with `,`, `;`, `<`, `>`, whitespace, `/`, `:` (unless valid IPv6), `:::`, `1:2:3`, empty, trailing dot (`localhost.`).
  - `normalizeHost(hostname: string): string` — lower-case, strip one pair of surrounding `[` `]`.
  - `effectiveHosts(extra: readonly string[]): string[]` — `DEFAULT_HOSTS` then `extra` lower-cased, de-duplicated, order kept.
  - `isAllowedHost(hostname: string, hosts: readonly string[]): boolean` — `normalizeHost(hostname)` equals an exact entry, or for a `*.x` entry ends with `.x` (subdomains only, not `x`). No trailing-dot normalisation (D-29).

- [ ] **Step 0:** Install: `npm i -E -w @poltergeist/core zod@4.6.7 playwright-core@1.64.1` and `npm i -E -D -w @poltergeist/core ws@8.22.0 @types/ws@8.18.2`. Add `- run: npx playwright-core install --with-deps chromium` before `npm run health` in `ci.yml`. Mark zod and playwright-core `yes` in STACK.md and add ws and @types/ws rows (core dev).
- [ ] **Step 1: Failing tests** (`it.each` tables for `isValidHostEntry` covering every true/false example above). `isAllowedHost` with `effectiveHosts(['*.cdn.test','API.test'])`: true for `localhost`, `LOCALHOST`, `127.0.0.1`, `[::1]`, `::1`, `api.test`, `a.cdn.test`, `a.b.cdn.test`; false for `cdn.test`, `evilcdn.test`, `localhost.`, `127.0.0.2`, `169.254.169.254`, `example.com`, `''`. `effectiveHosts(['localhost','X.test'])` equals `['localhost','127.0.0.1','::1','x.test']`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement `allowlist.ts`; export from `safety/index.ts`.
- [ ] **Step 4:** Run it and `npm run health`. Expected: PASS, green.
- [ ] **Step 5:** Commit: `F02: deps, CI Chromium, hostname allowlist`.

### Task 2: Errors and config schema

**Files:**
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/src/config/{schema.ts,errors.ts,index.ts}`
- Test: `packages/core/test/config/schema.test.ts`

**Interfaces:**
- Consumes: `isValidHostEntry` (Task 1).
- Produces:
  - `TargetSchema` (D-15): union of strict `{role: string, name: string}`, `{label: string}`, `{text: string}`, `{testId: string}`; `type Target`.
  - `ConfigSchema` (strict at every level): `target` (http/https URL string; origin only — no path other than `/`, no query, no hash, no userinfo), `allowedHosts: string[]` default `[]` (each must pass `isValidHostEntry` from Task 1), `routes: {path: string starting with "/", auth: boolean | string}[]` min 1, `accounts: Record<string, {loginRoute: string starting "/", username: string min 1, password: string min 1, fields?: {username?: Target, password?: Target, submit?: Target}}>` default `{}`, `resetCommand?: string` min 1 (after trim), `resetTimeoutMs` int 1000–600000 default 60000, `concurrency` int 1–20 default 12, `reps` int 1–10 default 3, `forbidden: {method: string, path: string starting "/"}[]` default `[]` (`method` is `*` or `/^[A-Za-z]+$/`), `model: string` default `'claude-sonnet-5-5'`. A `superRefine` adds an issue at `routes.<i>.auth` when the referenced account (`true` = `"default"`) is missing.
  - `type Config = z.output<typeof ConfigSchema>`, `type ForbiddenRule = Config['forbidden'][number]`, `type AccountConfig`, `type RouteConfig`.
  - `type ConfigIssue = { path: string; message: string }` (path is dot-joined, e.g. `routes.0.auth`; `''` for the root).
  - `class ConfigError extends Error { name='ConfigError'; readonly exitCode = 2; readonly issues: ConfigIssue[] }`; message is the issues as `path: message` lines.
  - `class ResetError extends Error { name='ResetError'; readonly exitCode = 2; readonly kind: 'exit'|'timeout'|'spawn'; readonly code: number | null; readonly signal: string | null; readonly outputTail: string }` (`code` is the process exit code).

- [ ] **Step 1: Failing tests** (`schema.test.ts`, use `ConfigSchema.safeParse`; a `base` valid config `{target:'http://localhost:4000', routes:[{path:'/',auth:false}]}`):
  - `base` parses with defaults: `concurrency 12, reps 3, resetTimeoutMs 60000, model 'claude-sonnet-5-5', allowedHosts [], forbidden [], accounts {}`.
  - Rejected, each asserting the issue path: `concurrency: 25` (`concurrency`), `concurrency: 0`, `concurrency: 1.5`, `reps: 11`, `reps: 0`, `resetTimeoutMs: 999`, `resetTimeoutMs: 600001`, `resetCommand: '  '`, `target: 'http://localhost:4000/app'`, `'http://localhost:4000/?a=1'`, `'http://localhost:4000/#x'`, `'ftp://localhost'`, `'not a url'`, `'http://u:p@localhost:4000'`, `'http://localhost@evil.com'` (all at path `target`), unknown root key `colour`, unknown nested keys `routes.0.extra`, `accounts.default.extra`, `forbidden.0.extra`, `accounts.default.fields.username.extra`, `allowedHosts: ['*']`, `routes: [{path:'/m',auth:true}]` with no accounts (path `routes.0.auth`), `auth: 'admin'` with only `default` (path `routes.0.auth`), `forbidden: [{method:'DE LETE', path:'/x'}]`.
  - Accepted: `target: 'http://localhost:4000/'`, `concurrency: 20`, `concurrency: 1`, `reps: 10`, `forbidden: [{method:'delete', path:'/api/*'}]`, `allowedHosts: ['api.test', '*.cdn.test', '10.0.0.1', '::1']`, an account with `fields: {submit: {role:'button', name:'Go'}}`.
- [ ] **Step 2:** Run `npx vitest run packages/core/test/config/schema.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement `schema.ts` and `errors.ts` (target refine uses `new URL`: protocol `http:`/`https:`, `pathname === '/'`, empty `search`, `hash`, `username`, `password`; a malformed URL is a schema issue, never a throw). Export through `config/index.ts` and `src/index.ts`.
- [ ] **Step 4:** Run the test, then `npm run health`. Expected: PASS, green.
- [ ] **Step 5:** Commit: `F02: config schema, ConfigError, ResetError`.

### Task 3: Redactor

**Files:**
- Create: `packages/core/src/config/redact.ts`
- Test: `packages/core/test/config/redact.test.ts`

**Interfaces:**
- Produces: `class Redactor { constructor(secrets: Iterable<string>); redact(text: string): string; get size(): number }` and `const REDACTED = '[REDACTED]'`.
  - Ignores empty strings. For each secret also adds `encodeURIComponent(secret)` when different (D-29). Replaces longest first, all occurrences, literal (no regex injection). Every non-empty secret is redacted regardless of length — safety beats readability.

- [ ] **Step 1: Failing tests:** `new Redactor(['hunter22']).redact('pw=hunter22 again hunter22')` → `'pw=[REDACTED] again [REDACTED]'`; `new Redactor(['p@ss w/rd']).redact('?p=p%40ss%20w%2Frd')` → `'?p=[REDACTED]'`; secrets `['ab','abcd']` on `'abcd ab'` → `'[REDACTED] [REDACTED]'`; secret `'a.b*'` on `'axb a.b*'` → `'axb [REDACTED]'`; a 3-char secret `'abc'` is redacted; `new Redactor(['']).size` is 0 and `redact('x')` is `'x'`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement it (split/join per secret).
- [ ] **Step 4:** Run it and health. Expected: PASS.
- [ ] **Step 5:** Commit: `F02: Redactor`.

### Task 4: Loader

**Files:**
- Create: `packages/core/src/config/load.ts`
- Test: `packages/core/test/config/load.test.ts`

**Interfaces:**
- Consumes: `ConfigSchema`, `ConfigError`, `Redactor`, `effectiveHosts`, `isAllowedHost`.
- Produces:
  - `type ConfigWarning = { code: 'literal-password' | 'unresolved-secret'; path: string; message: string }`
  - `type LoadedConfig = { config: Config; snapshot: unknown; configPath: string; configDir: string; allowedHosts: string[]; redactor: Redactor; warnings: ConfigWarning[]; env: NodeJS.ProcessEnv }`
    - `config`: defaults applied, every kept account's `password` resolved, unresolved unused accounts removed (D-29).
    - `snapshot`: the parsed JSON as written (raw `env:NAME`), for `run.json`.
    - `allowedHosts`: `effectiveHosts(config.allowedHosts)`.
  - `parseConfig(input: unknown, opts: { configPath: string; env?: NodeJS.ProcessEnv }): LoadedConfig` — pure, throws `ConfigError`.
  - `loadConfig(opts?: { path?: string; cwd?: string; env?: NodeJS.ProcessEnv }): Promise<LoadedConfig>` — `path` default `poltergeist.config.json`, resolved against `cwd` (default `process.cwd()`); `configDir = dirname(configPath)`; `env` default `process.env`.

**Rules:**
1. Read failure → `ConfigError` issue `{path:'', message:'cannot read <path>: <code>'}`. JSON failure → issue `{path:'', message:'invalid JSON: …'}`.
2. Schema issues → `ConfigError` with every issue; both `path` and `message` passed through `redactor.redact` (D-29). Build the redactor from resolved secrets *before* validating so issues can be redacted; resolve from the raw input defensively (skip non-string passwords).
3. Target host not allowlisted → `ConfigError` at `target`: `host "<host>" is not allowlisted; add it to allowedHosts (loopback is allowed by default)`.
4. Password `env:NAME` (`/^env:([A-Za-z_][A-Za-z0-9_]*)$/`): resolved from `env`. Unset or empty → `ConfigError` at `accounts.<name>.password` if a route uses the account; otherwise the account is dropped and an `unresolved-secret` warning is added. Any other password → kept, `literal-password` warning.

- [ ] **Step 1: Failing tests** (write configs to `mkdtemp` dirs):
  - Valid config with `password:'env:POLTERGEIST_PW'` and `env:{POLTERGEIST_PW:'hunter22'}` → `config.accounts.default.password === 'hunter22'`, `snapshot` keeps `'env:POLTERGEIST_PW'`, `redactor.redact('hunter22') === '[REDACTED]'`, `configDir` is the temp dir, `allowedHosts` starts with the three defaults.
  - **Done-when:** `target:'https://example.com'` → rejects with `ConfigError`, `exitCode 2`, issue path `target`, message contains `example.com` and `allowedHosts`.
  - `target:'http://api.test:8080'` with `allowedHosts:['api.test']` loads. `'http://localhost.:4000'` is refused (path `target`).
  - **Done-when:** `concurrency: 25` → `ConfigError` path `concurrency`.
  - Route-used account with unset env and with `''` env → `ConfigError` at `accounts.default.password`.
  - Unused account `spare` with unset env → loads, `config.accounts.spare` is undefined, warning `unresolved-secret` at `accounts.spare.password`.
  - Literal password → `literal-password` warning, loads.
  - Redacted issues: env `POLTERGEIST_PW='hunter22'` used by route-used account `default`, plus a second account *named* `hunter22` with an unknown key `extra` → `ConfigError`; no issue `path` or `message` contains `hunter22`.
  - Missing file → `ConfigError` message contains `cannot read`. File containing `{nope` → message contains `invalid JSON`.
  - `loadConfig({cwd: dir})` finds `poltergeist.config.json`; `loadConfig({path:'sub/x.json', cwd})` sets `configDir` to `<cwd>/sub`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement `load.ts`.
- [ ] **Step 4:** Run it and health. Expected: PASS.
- [ ] **Step 5:** Commit: `F02: loadConfig with env secrets, allowlisted target, redacted issues`.

### Task 5: `forbidden` matcher and limiter

**Files:**
- Create: `packages/core/src/safety/{forbidden.ts,limiter.ts}`
- Test: `packages/core/test/safety/{forbidden.test.ts,limiter.test.ts}`

**Interfaces:**
- Produces:
  - `type ForbiddenMatcher = (method: string, url: string) => ForbiddenRule | null`
  - `compileForbidden(rules: readonly ForbiddenRule[]): ForbiddenMatcher` — compiles each rule once. Method `*` matches any; otherwise case-insensitive exact. Path glob: escape regex specials, `*` → `.*`, anchored `^…$`, case-sensitive. Matches against `decodeURIComponent(new URL(url).pathname)`, falling back to the raw pathname on `URIError`. Query ignored. First matching rule wins.
  - `type Limiter = { <T>(task: () => T | Promise<T>): Promise<T>; readonly active: number; readonly pending: number }`
  - `createLimiter(n: number): Limiter` — `RangeError` unless `n` is an integer ≥ 1. FIFO. A task that throws synchronously becomes a rejection and frees its slot.

- [ ] **Step 1: Failing tests.** Forbidden with rules `[{method:'DELETE',path:'/api/admin/*'},{method:'*',path:'/api/*'}]`: `('delete','http://h/api/admin/x')` → first rule; `('DELETE','http://h/api/%61dmin/x')` → first rule (decoded); `('GET','http://h/api/admin/x?y=1')` → second rule; `('GET','http://h/API/x')` → null; `('GET','http://h/api/%E0%A4%A')` → second rule (bad encoding falls back to raw); `('GET','http://h/other')` → null; a rule path `/a.b` doesn't match `/axb`. Limiter: with `createLimiter(2)` and 5 deferred tasks, `active` never exceeds 2 and tasks start in order; a task that `throw`s synchronously rejects and the next queued task still runs; `createLimiter(0)` and `createLimiter(1.5)` throw `RangeError`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement both; export from `safety/index.ts`.
- [ ] **Step 4:** Run them and health. Expected: PASS.
- [ ] **Step 5:** Commit: `F02: precompiled forbidden matcher and concurrency limiter`.

### Task 6: `runReset`

**Files:**
- Create: `packages/core/src/config/reset.ts`
- Test: `packages/core/test/config/reset.test.ts`

**Interfaces:**
- Consumes: `LoadedConfig`, `ResetError`, `Redactor`.
- Produces: `type ResetResult = { durationMs: number; outputTail: string }` and `runReset(loaded: Pick<LoadedConfig, 'config' | 'configDir' | 'env' | 'redactor'>): Promise<ResetResult | null>` — `null` when no `resetCommand`.

**Rules (D-17, D-29):**
- `spawn(resetCommand, {shell: true, cwd: configDir, env: loaded.env, detached: true, stdio: ['ignore','pipe','pipe']})`. Collect stdout and stderr into one buffer in arrival order.
- Resolve on `exit` (not `close`): after `exit`, wait up to 100 ms for `close`, then `destroy()` both pipes and settle (KI-19).
- Timeout `config.resetTimeoutMs` → `process.kill(-pid, 'SIGKILL')`, `ResetError` kind `timeout`.
- Non-zero exit or signal → `ResetError` kind `exit` with `code`, `signal`. `spawn` `error` event → kind `spawn`.
- Output: `redactor.redact(full)` **then** keep the last 64 KB (65536 chars), then `outputTail` = last 20 lines. Both the result and every `ResetError` (message and `outputTail`) use the redacted tail.

- [ ] **Step 1: Failing tests** (use `node -e` commands for portability):
  - `resetCommand` undefined → `null`.
  - `node -e "process.stdout.write(process.cwd())"` → `outputTail` equals `configDir` (realpath both).
  - Secret through env: env `{...process.env, POLTERGEIST_PW:'hunter22'}`, redactor with `hunter22`, command `node -e "process.stdout.write('pw='+process.env.POLTERGEIST_PW)"` → `outputTail === 'pw=[REDACTED]'`.
  - Secret split across streams: `node -e "process.stdout.write('hun');setTimeout(()=>process.stderr.write('ter22'),20)"` → output contains `[REDACTED]`, not `ter22`.
  - Trim: a command printing 70 000 `x` then `\n` + 25 lines `L<i>` → `outputTail` is exactly the last 20 lines (`L5`…`L24`). Redact-before-trim: a secret positioned across the 64 KB cut point is fully redacted (print secret then 65 530 `y`): result does not contain any 4-char prefix of the secret except inside `[REDACTED]`.
  - `node -e "process.exit(3)"` → `ResetError` kind `exit`, `code 3`, `exitCode 2`.
  - `resetTimeoutMs: 1000`, `node -e "setTimeout(()=>{},10000)"` → kind `timeout` in < 3 s.
  - KI-19: `node -e "require('child_process').spawn(process.execPath,['-e','setTimeout(()=>{},5000)'],{stdio:'inherit',detached:false}); console.log('ok')"` → resolves (not timeout) within 2 s with `outputTail` `'ok'`.
  - `spawn` failure: `cwd` that doesn't exist (`configDir: '/nonexistent-poltergeist'`) → `ResetError` kind `spawn`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement `reset.ts`; export from `config/index.ts`.
- [ ] **Step 4:** Run it and health. Expected: PASS.
- [ ] **Step 5:** Commit: `F02: runReset (redact before trim, resolves on exit, process-group timeout)`.

### Task 7: Network guard

**Files:**
- Create: `packages/core/src/safety/guard.ts`, `packages/core/test/safety/fixture-server.ts`
- Modify: `package.json` (script), `packages/core/src/safety/index.ts`
- Test: `packages/core/test/safety/guard.test.ts` (browser), `packages/core/test/safety/classify.test.ts` (browser-free)

**Interfaces:**
- Consumes: `isAllowedHost`, `isValidHostEntry`, `normalizeHost`, `compileForbidden`, `ForbiddenRule`.
- Produces (exported from `safety/index.ts` except where noted):
  - `type BlockReason = 'host' | 'forbidden' | 'scheme' | 'redirect' | 'leak'`
  - `type BlockedRequest = { url: string; host: string; method: string; resourceType: string; reason: BlockReason; rule?: ForbiddenRule; errorText?: string }`
  - `type GuardOptions = { allowedHosts: readonly string[]; forbidden?: readonly ForbiddenRule[]; onBlocked?: (b: BlockedRequest) => void }` (`allowedHosts` is the effective list, i.e. `LoadedConfig.allowedHosts`).
  - `guardLaunchOptions(extra?: LaunchOptions): LaunchOptions` — appends `--force-webrtc-ip-handling-policy=disable_non_proxied_udp` to `extra.args`.
  - `newGuardedContext(browser: Browser, opts: GuardOptions, extra?: BrowserContextOptions): Promise<BrowserContext>` — throws `TypeError` if `extra` has `proxy` or `serviceWorkers`, or if any host fails `isValidHostEntry` (D-29). Creates the context with `proxy: {server: 'http://127.0.0.1:<dead port>', bypass}` and `serviceWorkers: 'block'`, adds the WebRTC init script, installs the guard.
  - `classifyRequestFailure(f: { url: string; method: string; resourceType: string; errorText: string }, allowedHosts: readonly string[]): BlockedRequest | null` — exported from `guard.ts` only (not the index), for browser-free tests.
  - Internal (not exported): `bypassList(hosts)` and `installNetworkGuard(context, opts)`.

**Rules (D-17, D-18, D-22, D-29):**
- **Dead port:** listen a `net` server on `127.0.0.1:0`, read the port, close it. Nothing listens there afterwards.
- **Bypass:** `'<-loopback>'` first, then each host (IPv6 wrapped in `[]`; `*.x` kept as is), joined with `,`.
- **WebRTC init script:** replace `RTCPeerConnection` and `webkitRTCPeerConnection` on `window` with a constructor that throws `DOMException('blocked by poltergeist', 'NotAllowedError')`.
- **`context.route('**/*')`:** `data:`/`blob:`/`about:` → `continue`. Scheme not `http`/`https` → abort, `scheme`. Host not allowlisted → abort `'blockedbyclient'`, `host`. `forbidden` match → abort, `forbidden` with `rule`. Else `route.continue()`. Record every aborted `Request` in a `WeakSet` *before* aborting; call `onBlocked` *after* the abort resolves (and also if abort throws), inside `try/catch`.
- **`context.routeWebSocket(/.*/)`:** same host and `forbidden` (method `GET`) checks; blocked → `ws.close({code: 1008, reason: 'blocked by poltergeist'})` then report with `resourceType 'websocket'`; else `ws.connectToServer()`.
- **`context.on('requestfailed')`:** skip requests in the `WeakSet`. Else `classifyRequestFailure` on `{url, method, resourceType, errorText: request.failure()?.errorText ?? ''}`, and report a non-null result.
- **`classifyRequestFailure`:** host not allowlisted: `ERR_PROXY_CONNECTION_FAILED` or `ERR_BLOCKED_BY_CLIENT` → `host`, anything else → `leak`. Host allowlisted: `ERR_PROXY_CONNECTION_FAILED` → `redirect`, anything else → `null`. Non-http(s) schemes → `null`. Always carry `errorText`.
- **`context.on('requestfinished')`:** an http(s) request to a non-allowlisted host that *finished* → report `leak` (conservative; should never happen).

**Fixture (`fixture-server.ts`):** `startFixture(): Promise<{ origin: string; port: number; close(): Promise<void> }>` — `node:http` on `{host:'::', ipv6Only:false, port:0}` plus a `ws` `WebSocketServer` on the same server at `/ws` (echo). Routes: `/` HTML page; `/ok` → `200 ok`; `/redirect?to=<url>` → `302` to `to`; `/sse-redirect?to=` same with `text/event-stream` intent; `origin` is `http://127.0.0.1:<port>`.

**Browser test setup:** one `chromium.launch(guardLaunchOptions({args: ['--host-resolver-rules=MAP *.test 127.0.0.1']}))` per file (`beforeAll`), a fresh guarded context per test, `blocked: BlockedRequest[]` collected via `onBlocked`, assertions with `expect.poll` (reports are async). Every test sets a 15 s timeout.

- [ ] **Step 1: Failing browser-free tests** (`classify.test.ts`): the full table from the rules above, including `errorText` carried through, `redirect` uses the original URL/host, `ws:`-free `data:` URL → `null`.
- [ ] **Step 2: Failing browser tests** (`guard.test.ts`, `page.goto(origin + '/')` first):
  - **Done-when** third-party fetch: `page.evaluate(() => fetch('http://example.com/x').catch(() => 'err'))` → `'err'`; exactly one report `{host:'example.com', reason:'host', method:'GET'}`.
  - **Done-when** redirect hop: `fetch(origin + '/redirect?to=' + encodeURIComponent('http://example.com/'))` → stopped, exactly one report with reason `host` (host `example.com`) or `redirect` (host `127.0.0.1`) (D-22). Same for `http://169.254.169.254/latest/meta-data/` and for a two-hop chain `/redirect?to=/redirect?to=http://example.com/`. Same for an `EventSource` to `/redirect?to=http://example.com/` (wait for its `error`).
  - **Done-when** WebSocket: `new WebSocket('ws://example.com/ws')` → `close` event; one report `{reason:'host', resourceType:'websocket'}`. `ws://127.0.0.1:<port>/ws` echoes `'hi'` (allowed path works through `connectToServer`).
  - Redirects within loopback work: `/redirect?to=http://localhost:<port>/ok` and `…http://[::1]:<port>/ok` return `'ok'`, no reports.
  - Non-empty allowlist: with `allowedHosts: effectiveHosts(['ghost.test'])`, `fetch('http://ghost.test:<port>/ok')` → `'ok'`, and `http://evil.test:<port>/ok` (resolves to 127.0.0.1 too) → blocked, `host`.
  - `127.0.0.2` redirect hop → stopped and reported once.
  - `forbidden: [{method:'POST', path:'/api/*'}]`: `fetch(origin+'/api/x',{method:'POST'})` → `'err'`, one report `{reason:'forbidden', rule:{method:'POST',path:'/api/*'}}`; `GET /api/x` is not reported.
  - Scheme: `page.goto('file:///etc/hostname')` fails and one report has reason `scheme`.
  - WebRTC: `page.evaluate(() => { try { new RTCPeerConnection(); return 'made'; } catch (e) { return (e as Error).name; } })` → `'NotAllowedError'`.
  - Service workers blocked: `page.evaluate(() => navigator.serviceWorker?.register('/sw.js').then(()=>'ok', ()=>'err') ?? 'none')` is not `'ok'`.
  - A throwing `onBlocked` doesn't break the page: the third-party fetch still resolves to `'err'` and a later `fetch(origin+'/ok')` returns `'ok'`.
  - `newGuardedContext(browser, opts, {proxy:{server:'x'}})` and `{serviceWorkers:'allow'}` reject with `TypeError`; `allowedHosts: ['a.test,evil.com']` and `['<-loopback>']` reject with `TypeError`.
- [ ] **Step 3:** Run `npx vitest run packages/core/test/safety`. Expected: FAIL.
- [ ] **Step 4:** Implement `guard.ts` and the fixture. Add root script `"test:guard:1cpu": "taskset -c 0 vitest run packages/core/test/safety packages/core/test/config"`.
- [ ] **Step 5:** Run the safety tests, then `npm run health`. Expected: PASS, green.
- [ ] **Step 6: Done-when stress:** `for i in 1 2 3 4 5; do npm run test:guard:1cpu || break; done`. Expected: 5 of 5 pass. If not, reproduce and read the event log before changing anything (LESSONS § process 6).
- [ ] **Step 7:** Commit: `F02: network guard (dead proxy, WebRTC block, forbidden, redirect reporting)`.

### Task 8: Close the cycle

**Files:**
- Modify: `docs/PRD.md`, `.kiro/specs/poltergeist/tasks.md`, `.kiro/specs/poltergeist/design.md` (§3 note: `resetCommand` must not start servers; §5 note: bypass builder internal), `docs/KNOWN_ISSUES.md`, `AGENTS.md`, `docs/STACK.md`

- [ ] **Step 1:** PRD: F02 status `Done` with a dated note, changelog line. Tick F02 in `tasks.md`.
- [ ] **Step 2:** KNOWN_ISSUES: KI-19, KI-20, KI-21 → `Resolved (2026-10-31, D-29)` with what fixed them; KI-17 note (decoding fixed, redirect hops still open for F17); KI-22 note (userinfo targets now rejected). Update the summary table.
- [ ] **Step 3:** AGENTS.md "Current state": F02 built; next F10 (in Kiro), then F03.
- [ ] **Step 4:** `npm run health`. Expected: green. Commit: `F02: close cycle (PRD, tasks, KNOWN_ISSUES, AGENTS)`.
