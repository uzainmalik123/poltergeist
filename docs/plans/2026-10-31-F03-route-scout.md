# F03 Route Scout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `@poltergeist/core` can visit every configured route as the right identity, log in (heuristic or `fields` override), and write a budgeted, redacted, hashed `scout/<slug>.json` per route listing the real interactive elements by role, name, label and testId (Requirement 3).

**Architecture:** `packages/core/src/scout/`. Pure modules first: `slug.ts`, `hash.ts`, `aria.ts` (parses Playwright's `ariaSnapshot()` YAML into interactive elements) and `trim.ts` (the prompt budget). Then browser modules: `capture.ts` (snapshot + label/testId resolution on one page), `login.ts` (fills and submits the login form, decides success) and `scout.ts` (identities, guarded contexts, per-route budget, statuses, files, hashes). Browser tests run against a tests-only `node:http` app shaped like Candy Swap (D-30), never the internet.

**Tech Stack:** TypeScript 5.9.3, Node ≥ 22, playwright-core 1.64.1 (Chromium), zod 4.6.7 (config only), vitest 4.1.12. No new dependencies.

**Spec:** `.kiro/specs/poltergeist/requirements.md` Requirement 3 · `design.md` §9 (run folder) · `docs/DECISIONS.md` D-15, D-18, D-20, D-21, D-29, D-30 (new, Task 1) · `docs/PRD.md` F03 · `docs/LESSONS.md` § F03 · `docs/KNOWN_ISSUES.md` KI-22.

## Global Constraints

- Fresh code only (D-25). Never open `../poltergeist-old`.
- Contexts come only from `newGuardedContext(browser, { allowedHosts: loaded.allowedHosts, forbidden: loaded.config.forbidden, onBlocked }, extra?)` (D-18). The caller launches Chromium with `guardLaunchOptions()`; tests do the same.
- One context per identity, opened one at a time: `anonymous` (only if some route has `auth: false`) first, then each account in order of first use in `config.routes`. `auth: true` means account `"default"`.
- `storageState` stays in memory. Nothing Scout writes may contain a session cookie value or a password (Req 3.3).
- Scout never clicks anything except the login submit, and never runs `resetCommand`.
- Defaults: `routeTimeoutMs = 10000`, `loginTimeoutMs = 10000`, capture reserve = 20% of `routeTimeoutMs`, testId lookup timeout 250 ms, `TRIM_CHARS = 16000`, interactive cap 200 entries and ≤ 75% of `TRIM_CHARS`, text collapse at 80 chars, trim marker `… [trimmed]`.
- Only Playwright's `errors.TimeoutError` counts as a timeout. Any other error is a failure whose reason is its message's first line, redacted.
- Every string written to disk or passed to `onRoute`/`onBlocked` goes through `loaded.redactor.redact()` first.
- Interactive roles: `button, link, textbox, searchbox, checkbox, radio, combobox, listbox, option, menuitem, menuitemcheckbox, menuitemradio, tab, switch, slider, spinbutton`. Labelable roles (label lookup): `textbox, searchbox, checkbox, radio, combobox, listbox, slider, spinbutton, switch`.
- Tests live in `packages/core/test/scout/`. `src/scout/index.ts` exports the public API; `src/index.ts` re-exports it.
- `npm run health` green after every task (D-19). Commit messages `F03: <what>`.

## Review Focus

1. **A login that fails onto a sub-path** (`/login/failed`) or shows an error in place must fail fast (well under `loginTimeoutMs`), not count as success. Pinned in Task 5.
2. **A secret that appears in page content** (a button name, a testId, the title, a redirect URL) must not reach any written file, and elements whose name or testId would change under redaction are dropped, not written as `[REDACTED]`. Pinned in Tasks 4 and 6.
3. **A page that never settles** (polling every 150 ms) is `ok` with `settled:false`; **a page that never responds** is `unreachable` within `routeTimeoutMs + 1500 ms`, and the next route still runs. Pinned in Task 6.
4. **A huge page** (2000 buttons, long text) yields JSON whose `{interactive, testIds, snapshot}` fits `TRIM_CHARS`, with `snapshotFull` intact. Pinned in Tasks 3 and 6.
5. **Two route paths that slug the same** (`/a.b`, `/a_b`) must write two files. Pinned in Task 1.

---

## File Structure

```
packages/core/src/scout/types.ts     RouteStatus, InteractiveElement, TestIdElement, RouteScout, ScoutOptions, ScoutResult, StorageState
packages/core/src/scout/slug.ts      slugsFor
packages/core/src/scout/hash.ts      routeHash, scoutHash
packages/core/src/scout/aria.ts      INTERACTIVE_ROLES, LABELABLE_ROLES, parseAriaLine, interactiveFromSnapshot
packages/core/src/scout/trim.ts      TRIM_CHARS, collapseLine, trimForPrompt
packages/core/src/scout/capture.ts   captureRoute
packages/core/src/scout/login.ts     isUnderLoginRoute, login
packages/core/src/scout/scout.ts     scout
packages/core/src/scout/index.ts
packages/core/src/index.ts           + export * from './scout/index.js'
packages/core/test/scout/candy-fixture.ts   node:http app shaped like Candy Swap
packages/core/test/scout/{slug,hash,aria,trim,capture,login,scout}.test.ts
docs/DECISIONS.md, docs/KNOWN_ISSUES.md       D-30, KI-30 (Task 1); KI-22 resolved (Task 7)
docs/PRD.md, .kiro/specs/poltergeist/tasks.md, design.md, AGENTS.md   close (Task 7)
```

---

### Task 1: Rulings, types, slugs and hashes

**Files:**
- Modify: `docs/DECISIONS.md` (table + new `### D-30`), `docs/KNOWN_ISSUES.md` (table + new `### KI-30`)
- Create: `packages/core/src/scout/{types,slug,hash,index}.ts`, modify `packages/core/src/index.ts`
- Test: `packages/core/test/scout/slug.test.ts`, `packages/core/test/scout/hash.test.ts`

**Interfaces:**
- Produces (types.ts):
  ```ts
  export type RouteStatus = 'ok' | 'redirected' | 'unreachable' | 'authFailed';
  export type InteractiveElement = { role: string; name: string; count: number; label?: string; testId?: string };
  export type TestIdElement = { testId: string; role?: string; name?: string };
  export type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;
  export type RouteScout = {
    path: string; slug: string; identity: string; // 'anonymous' or the account name
    status: RouteStatus; reason?: string; finalPath?: string; title?: string; settled: boolean;
    interactive: InteractiveElement[]; testIds: TestIdElement[];
    snapshot: string; snapshotFull: string; trimmed: boolean;
    routeHash: string; blocked: BlockedRequest[];
  };
  export type ScoutOptions = { outDir: string; routeTimeoutMs?: number; loginTimeoutMs?: number;
    onRoute?: (route: RouteScout) => void; onBlocked?: (blocked: BlockedRequest) => void };
  export type ScoutResult = { routes: RouteScout[]; scoutHash: string; sessions: Map<string, StorageState> };
  ```
- Produces: `slugsFor(paths: readonly string[]): Map<string, string>`, `routeHash(status: RouteStatus, interactive: readonly InteractiveElement[], testIds: readonly TestIdElement[]): string`, `scoutHash(routes: readonly { path: string; routeHash: string }[]): string`.

- [ ] **Step 1: Record the rulings.** Add **D-30 "F03 rebuild rulings (extends D-20, D-21)"**, Accepted, with the grill answers: fixture-first because F10 isn't built (re-instates D-20's fixture bullet for this cycle only; the real Candy Swap Done-when check reruns when F10 lands), all KI-22 items in the first pass, the login success rule from Task 5, the testId attach-or-list rule from Task 4, statuses from Task 6 (HTTP ≥ 400 → `unreachable`), the trim invariant from Task 3, sha256 hashes and the slug collision suffix. Add **KI-30 "F03 Done-when not yet run against the real Candy Swap"**, Major, blocks F03 sign-off / KI-01 spike, Open, next action: when F10 lands, run Scout against `:4000` and check "Claim" buttons and trade-form fields.

- [ ] **Step 2: Write failing tests.**
  - `slugsFor`: `/` → `index`; `/trade/new` → `trade__new`; `/market/` → `market`; `/a b?x=1` → `a_b_x_1`; `/a.b` and `/a_b` both get `a_b-<6 hex>` with different suffixes, and the suffix is `sha256(path).slice(0,6)`; `/index` and `/` both suffixed; a non-colliding path never gets a suffix; same input → same output.
  - `routeHash`: 16 hex chars; independent of the order of `interactive` and `testIds`; changes when `count` changes, when a `label` is added, when status changes; ignores everything else (no title/snapshot parameter exists).
  - `scoutHash`: independent of route order; changes when one `routeHash` changes.

- [ ] **Step 3: Run** `npx vitest run packages/core/test/scout` — FAIL (modules missing).

- [ ] **Step 4: Implement.** Slug: strip the leading `/` and any trailing `/`, empty → `index`, `/` → `__`, every char outside `[A-Za-z0-9_-]` → `_`; collisions get `-` + 6 hex. Hashes: sha256 over `JSON.stringify` of the canonical form (entries mapped to fixed key order `role,name,count,label,testId`, sorted by that JSON string; testIds sorted by id), first 16 hex. Export everything from `src/scout/index.ts` and `export * from './scout/index.js'` in `src/index.ts`.

- [ ] **Step 5: Run** the scout tests — PASS. `npm run health` — green.

- [ ] **Step 6: Commit** `F03: rulings (D-30, KI-30), types, slugs and hashes`.

### Task 2: Aria snapshot parser

**Files:** Create `packages/core/src/scout/aria.ts` · Test `packages/core/test/scout/aria.test.ts`

**Interfaces:**
- Produces: `INTERACTIVE_ROLES: ReadonlySet<string>`, `LABELABLE_ROLES: ReadonlySet<string>`, `parseAriaLine(line: string): { role: string; name: string } | null`, `interactiveFromSnapshot(yaml: string): InteractiveElement[]` (document order, duplicates merged into the first occurrence's `count`, no `label`/`testId`).

Element lines look like (verified on playwright-core 1.64.1):
```
- heading "Market" [level=1]
- navigation:
  - link "Home":
    - /url: /x
- textbox "Candy \"name\""
- button "a\\b \"c\"": x
- checkbox "Agree" [checked]
- textbox
- text: ok
```

- [ ] **Step 1: Write failing tests.** `parseAriaLine`: `  - button "Claim Sour Skulls"` → `{role:'button', name:'Claim Sour Skulls'}`; `- button "a\\b \"c\"": x` → name `a\b "c"` (full JSON unescape, incl. `\n` and `é`); `- checkbox "Agree" [checked]` → name `Agree`; `- textbox` → name `''`; `- text: ok`, `- /url: /x`, a blank line, and a regex name `- button /Claim \d+/` → `null`. `interactiveFromSnapshot` on the block above → `[link Home, textbox 'Candy "name"', button 'a\b "c"', checkbox Agree, textbox '']` with `count:1` each (heading/navigation/text dropped); two `button "Claim"` lines → one entry `count:2` at the first position; a name of 300 chars is kept whole (trimming is Task 3's job).

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement** with one regex over the line: `^\s*- ([a-z]+)(?: ("(?:[^"\\]|\\.)*"))?(?: \[[^\]]*\])*:?(?: .*)?$`, name via `JSON.parse` of the quoted group (catch → `null`). A role followed by anything else (e.g. `/regex/`) → `null`.

- [ ] **Step 4: Run** — PASS; health green. **Step 5: Commit** `F03: aria snapshot parser`.

### Task 3: Prompt budget (trim)

**Files:** Create `packages/core/src/scout/trim.ts` · Test `packages/core/test/scout/trim.test.ts`

**Interfaces:**
- Produces: `TRIM_CHARS = 16000`, `collapseLine(line: string): string`, `trimForPrompt(input: { interactive: InteractiveElement[]; testIds: TestIdElement[]; snapshotFull: string }, budget?: number): { interactive: InteractiveElement[]; testIds: TestIdElement[]; snapshot: string; trimmed: boolean }`.

**The invariant:** `JSON.stringify({ interactive, testIds, snapshot }).length <= budget` for the result. The key and punctuation overhead is measured, never a constant.

- [ ] **Step 1: Write failing tests.**
  - `collapseLine`: a quoted name of 120 chars containing `"` and `\` becomes the first 80 decoded chars + `…`, re-encoded, and `parseAriaLine` still parses it; trailing text after `": "` / `- text: ` longer than 80 chars becomes 80 + `…`; a line where both apply has both collapsed and still parses; short lines unchanged.
  - `trimForPrompt`: small input → unchanged, `trimmed:false`; 2000 interactive entries → ≤ 200 kept, kept in order from the front, `JSON.stringify({interactive, testIds}).length <= 0.75 * budget`; 300 testIds plus 300 interactive → combined lists still ≤ 75%; a 100 KB snapshot → result ends with `\n… [trimmed]`, holds whole lines only, every kept line equals `collapseLine` of an input line, and the invariant holds; a snapshot full of `"` and `\` (escape-heavy) still satisfies the invariant (JSON-escaped length, not raw length); `budget = 2000` with nothing fitting → `snapshot === '… [trimmed]'` and the invariant still holds (drop interactive entries further if needed).

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement.** Interactive: take the first 200, then pop from the end while the two lists' JSON exceeds 75% of budget (testIds are popped first). Snapshot: collapse every line, then add whole lines while the full invariant (with the marker appended if any line is dropped) holds.

- [ ] **Step 4: Run** — PASS; health green. **Step 5: Commit** `F03: prompt budget trim`.

### Task 4: Candy fixture and route capture

**Files:**
- Create: `packages/core/test/scout/candy-fixture.ts`, `packages/core/src/scout/capture.ts`
- Test: `packages/core/test/scout/capture.test.ts`

**Interfaces:**
- Produces (fixture): `startCandyFixture(): Promise<{ origin: string; close(): Promise<void> }>` with password `phantom-pass-77` for user `ghost1` and session cookie value `sid-s3cr3t-cookie`. Routes:
  - `GET /login` (form: label "Username", label "Password" `type=password`, button "Log in"); `POST /login` → correct: `Set-Cookie sid=…`, 303 `/market`; wrong: 303 `/login/failed` (same form + `role=alert` "Wrong password").
  - `GET /spa-login`: same form; a script `fetch`es `POST /login?spa=1`, then on success sets the cookie (via the response) and replaces the form with `<p>Welcome</p>` without navigating; on failure shows `role=alert`.
  - `GET /market` (cookie required, else 302 `/login`): heading "Market"; buttons "Claim Sour Skulls" (`data-testid="claim-sour-skulls"`), "Claim Candy Corn", "Claim Candy Corn" (duplicate name); three `<div data-testid="candy-card">` (duplicate testId); a `<p data-testid="market-status">` ; a button named `phantom-pass-77` and a `<span data-testid="tid-phantom-pass-77">` (secret in content).
  - `GET /trade/new` (cookie required): `<form>` with label "Offer" (input), label "Want" (select with options), label "Note" (textarea), button "Propose trade", `<p data-testid="trade-status">`.
  - `GET /` public home with link "Market"; `GET /old` 301 → `/`; `GET /missing` 404; `GET /boom` 500; `GET /slow` never responds (held until `close()`); `GET /busy` page `fetch`es `/api/ping` every 150 ms; `GET /huge` 2000 buttons "Item N" plus 200 paragraphs of 200 chars; `GET /ext` page `fetch`es `http://evil.test/x`; `GET /vault` (cookie `vault=1` required, else 302 `/login`); `GET /api/ping` 200.
- Consumes: `interactiveFromSnapshot`, `LABELABLE_ROLES`, `INTERACTIVE_ROLES`, `Redactor`.
- Produces: `captureRoute(page: Page, opts: { deadline: number; redactor: Redactor; testIdTimeoutMs?: number }): Promise<{ title: string; snapshotFull: string; interactive: InteractiveElement[]; testIds: TestIdElement[] }>` — throws Playwright's `TimeoutError` if the snapshot misses the deadline.

Rules:
- `snapshotFull` = redacted `page.locator('body').ariaSnapshot({ timeout: deadline - now })`. Parse elements from the **unredacted** text, then drop every entry whose `name` changes under redaction. Title redacted.
- Labels: for each labelable entry with a non-empty name and `count === 1`, `page.getByLabel(name, { exact: true }).count() === 1` → `label = name`. All lookups run concurrently, each in its own try/catch (a failure means no label).
- TestIds: values from `page.locator('[data-testid]').evaluateAll(els => els.map(e => e.getAttribute('data-testid')))`. Ids occurring more than once, or changed by redaction, are dropped. Each remaining id: `getByTestId(id).ariaSnapshot({ timeout: testIdTimeoutMs ?? 250 })` → first line through `parseAriaLine`. If it parses to an interactive role and the matching `role`+`name` entry has `count === 1` and no `testId` → attach. Otherwise push `{ testId, role?, name? }` to `testIds` (bare `{ testId }` when the lookup failed or the line didn't parse). Concurrent, per-id try/catch.

- [ ] **Step 1: Write failing tests** (real Chromium, `guardLaunchOptions()`, `newGuardedContext`, log in by posting the form directly with `page.request` or by visiting `/login` and filling it, the Redactor built with `['phantom-pass-77']`):
  - `/market`: `interactive` contains `{role:'button', name:'Claim Sour Skulls', count:1, testId:'claim-sour-skulls'}` and `{role:'button', name:'Claim Candy Corn', count:2}` (no testId); `testIds` contains `{testId:'market-status', …}` and no `candy-card`; no entry, testId, title or `snapshotFull` contains `phantom-pass-77`.
  - `/trade/new`: textbox "Offer" has `label:'Offer'`, combobox "Want" has `label:'Want'`, textbox "Note" has `label:'Note'`; button "Propose trade" present; `trade-status` in `testIds`.
  - **Every emitted target resolves:** for each entry with `label`, `getByLabel(label, {exact:true}).count() === 1`; for each `testId` (entries and list), `getByTestId(id).count() === 1`.
  - A deadline already in the past → rejects with `TimeoutError`.
  - `testIdTimeoutMs: 1` still returns (testIds degrade to bare `{testId}` or attach; never throws).

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** `captureRoute`. **Step 4: Run** — PASS; health green. **Step 5: Commit** `F03: Candy fixture and route capture`.

### Task 5: Login

**Files:** Create `packages/core/src/scout/login.ts` · Test `packages/core/test/scout/login.test.ts`

**Interfaces:**
- Consumes: `AccountConfig`, `Target` (config schema), `Redactor`, the fixture.
- Produces: `isUnderLoginRoute(pathname: string, loginRoute: string): boolean`, `login(page: Page, account: AccountConfig, opts: { origin: string; deadline: number; redactor: Redactor }): Promise<{ ok: true } | { ok: false; reason: string }>`.

Rules:
- `isUnderLoginRoute`: exact match, or `pathname` starts with `loginRoute` (trailing `/` stripped) + `/`. `loginRoute === '/'` matches only `/`.
- Fields: an override target is resolved with `{role,name}` → `getByRole(role, {name, exact:true})`, `{label}` → `getByLabel(label, {exact:true})`, `{text}` → `getByText(text, {exact:true})`, `{testId}` → `getByTestId`. It must `count() === 1`, else fail now with `fields.<key> override matched <n> elements`. Heuristic: username = first visible of `input[type=email], input[autocomplete=username], input[name*=user i], input[id*=user i], input[name*=email i], input[id*=email i], input[name*=login i]`, falling back to the first visible `input[type=text]`; password = first visible `input[type=password]`; submit = first visible `getByRole('button', { name: /log ?in|sign ?in|submit|continue/i })`, falling back to `form [type=submit]`. A missing field → fail now with `no <key> field found on <loginRoute>`.
- After the click, poll every 100 ms until `deadline`: **success** iff no visible password field **and** (`pathname` is off the `loginRoute` subtree **or** `pathname === loginRoute`). **Fail fast** iff not success and (a main-frame `load` happened after the click, or a `role=alert` is visible), re-checked once after a 500 ms grace: reason `login failed: still on <pathname> after submit` (or `… error shown: <alert text first line>`). Deadline → `login timed out after <n> ms`.
- Every reason is redacted (never contains the password). Only `TimeoutError` maps to the timeout reason.

- [ ] **Step 1: Write failing tests.** `isUnderLoginRoute`: `/login`,`/login/failed` under `/login`; `/login-help`, `/market` not; `/x` not under `/`. `login` against the fixture (`deadline = now + 10000`):
  - right password on `/login` → `{ok:true}` and the context has cookie `sid`.
  - wrong password → `{ok:false}` in **< 3000 ms**, reason contains `/login/failed`, reason never contains the password.
  - SPA `/spa-login` right password → `{ok:true}` (stays on `/spa-login`, no password field); wrong → `{ok:false}` < 3000 ms via the alert.
  - `fields: { submit: { role:'button', name:'Nope' } }` → `{ok:false}`, reason `fields.submit override matched 0 elements`, < 2000 ms.
  - `fields` using `{label:'Username'}`, `{label:'Password'}`, `{role:'button', name:'Log in'}` → `{ok:true}`.
  - loginRoute `/missing` (no form) → `{ok:false}`, reason starts `no username field found`.
  - `deadline = now + 300` on `/slow` as loginRoute → `{ok:false}` with a timeout reason, returns < 1500 ms.

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS; health green. **Step 5: Commit** `F03: login heuristic, fields overrides, fail-fast`.

### Task 6: `scout()` orchestration and Done-when

**Files:** Create `packages/core/src/scout/scout.ts`, update `src/scout/index.ts` · Test `packages/core/test/scout/scout.test.ts`

**Interfaces:**
- Consumes: everything above; `parseConfig(input, { configPath, env })` to build a `LoadedConfig` in tests; `newGuardedContext`.
- Produces: `scout(browser: Browser, loaded: LoadedConfig, opts: ScoutOptions): Promise<ScoutResult>`.

Per identity: open the context (`extra = {}`), and for an account call `login` on `loginRoute` with `deadline = now + loginTimeoutMs`. On failure every route of that account becomes `{status:'authFailed', reason}` without a visit; on success `sessions.set(name, await context.storageState())`. Close the context in `finally`.

Per route (`deadline = start + routeTimeoutMs`, `reserve = 0.2 * routeTimeoutMs`):
1. `goto(origin + path, { waitUntil:'load', timeout: deadline - reserve - now })`. Timeout → `unreachable`, `load timed out after <n> ms`; other error → `unreachable`, first line; response status ≥ 400 → `unreachable`, `HTTP <status>`.
2. `waitForLoadState('networkidle', { timeout: deadline - reserve - now })` (skip if ≤ 0); timeout → `settled:false`.
3. `finalPath = new URL(page.url()).pathname`. An account route with `finalPath === loginRoute` → `authFailed`, `session lost: redirected to <loginRoute>`. Else `finalPath !== new URL(path, origin).pathname` → `redirected`, `redirected to <finalPath>`. Else `ok`.
4. `captureRoute(page, { deadline, redactor })`. Any error → `unreachable`, `capture failed: <first line>`, then close the page and open a fresh one in the same context for the next route.
5. Only `ok`/`redirected` keep `title`, `interactive`, `testIds`, `snapshot`, `snapshotFull` (after `trimForPrompt`); others get empty values and `trimmed:false`.
6. `blocked` = this route's `onBlocked` reports with `url`, `host`, `errorText` redacted (also forwarded to `opts.onBlocked`). `reason` and `finalPath` redacted. `routeHash` computed. Write `outDir/scout/<slug>.json` (pretty JSON). Call `onRoute` (visit order). `result.routes` is in config order.

- [ ] **Step 1: Write failing tests.** One `beforeAll` fixture + browser (`guardLaunchOptions({ args: ['--host-resolver-rules=MAP *.test 127.0.0.1'] })`), outDir in `os.tmpdir()`. Config: `target` = fixture origin, routes `/` (false), `/old` (false), `/missing` (false), `/slow` (false), `/busy` (false), `/ext` (false), `/huge` (false), `/market` (true), `/trade/new` (true), `/vault` (true), `/inventory` (`"bad"`); accounts `default` (`ghost1` / `env:GHOST_PASS`, env `phantom-pass-77`, loginRoute `/login`) and `bad` (wrong password). `routeTimeoutMs: 3000`.
  - **Done when (fixture, D-30):** `/market` lists `button "Claim Sour Skulls"` (with testId) and `button "Claim Candy Corn"` (count 2); `/trade/new` lists textbox Offer, combobox Want, textbox Note with labels and button "Propose trade"; re-opening a guarded context with `storageState: sessions.get('default')`, every emitted label and testId on both routes resolves to exactly one element.
  - Statuses: `/` ok; `/old` redirected (`finalPath:'/'`); `/missing` unreachable `HTTP 404`; `/slow` unreachable within `3000 + 1500` ms of its start and `/busy` after it is `ok` with `settled:false`; `/vault` authFailed `session lost…`; `/inventory` authFailed (login failed) and no file content suggests it was visited (no `title`).
  - `/ext`: `blocked` has one entry with host `evil.test`, reason `host`.
  - `/huge`: `JSON.stringify({interactive, testIds, snapshot}).length <= 16000`, `trimmed:true`, `snapshotFull` contains `Item 1999`.
  - Files: `scout/index.json`, `scout/old.json`, `scout/trade__new.json`, … one per route and nothing else in `scout/`; no file under `outDir` contains `phantom-pass-77` or `sid-s3cr3t-cookie`.
  - `onRoute` order: anonymous routes first, then `default`'s, then `bad`'s; `result.routes` order equals config order.
  - `scoutHash` is stable across two runs of `scout` against the same fixture (status and elements unchanged) and `routeHash` of `/market` is identical in both.

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS; then `taskset -c 0 npx vitest run packages/core/test/scout` passes 3 of 3. `npm run health` green.

- [ ] **Step 5: Commit** `F03: scout orchestration, statuses, files, Done-when on fixture`.

### Task 7: Close the cycle

**Files:** `docs/PRD.md`, `.kiro/specs/poltergeist/tasks.md`, `.kiro/specs/poltergeist/design.md`, `docs/KNOWN_ISSUES.md`, `AGENTS.md`, `package.json` (script)

- [ ] **Step 1:** Extend `test:guard:1cpu` in root `package.json` to include `packages/core/test/scout`.
- [ ] **Step 2:** PRD F03 → `Done (fixture; real Candy Swap check pending F10, KI-30)` with a dated note and the plan path; status board; changelog line. `tasks.md` item 4 ticked with the same caveat. `design.md`: add the `scout()` API and route-file shape to the Scout section (or §9). KI-22 → Resolved (2026-10-31, D-30) with a line per item; KI-03 and KI-10 get an F03 note. AGENTS.md "Current state" and "Do first".
- [ ] **Step 3:** `npm run health` — green; quote counts.
- [ ] **Step 4: Commit** `F03: close cycle (PRD, tasks, design, KNOWN_ISSUES, AGENTS)`.
