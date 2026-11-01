# F06 Ghost Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run compiled Haunting Plans deterministically with Playwright Chromium against the user's app: many ghosts at once, N reps, barriers, held requests, timeouts, guard-aware step outcomes, a ghost-cursor overlay, frames, artifacts and run events. The output is the raw per-rep results F07 turns into verdicts.

**Architecture:** A new `packages/core/src/runner/` module. It has pure primitives (seed, JSON-path subset, path glob, conflict keys, scheduler, barrier set, event sink), page helpers (holds, overlay, throttle, frames), an actor step executor, an assertion evaluator, and `runPlans()`, which orchestrates reps, resets, guarded contexts per actor, and artifacts. The browser is injected (launched by the caller with `guardLaunchOptions()`), like `scout()`.

**Tech Stack:** TypeScript (ESM, Node ≥ 22), playwright-core 1.64.1 (Chromium + CDP), vitest 4, node:crypto, node:fs/promises.

**Spec:** `.kiro/specs/poltergeist/requirements.md` Requirement 6 (and 2.5, 2.7, 2.8), `.kiro/specs/poltergeist/design.md` §5, §6, §8, §9, `docs/DECISIONS.md` D-33 (the grilled rulings; read it first), D-18, D-22, D-32, and `docs/PRD.md` § F06.

## Global Constraints

- Every context is made with `newGuardedContext(browser, { allowedHosts: loaded.allowedHosts, forbidden: loaded.config.forbidden, onBlocked }, extra)`. Never call `browser.newContext` (D-18).
- Step timeout **5000 ms**, plan timeout **60000 ms** (Req 6.8). Both can be overridden through `RunOptions` for tests only.
- Frames are **≤ 4 fps per ghost**. `frameFps` is 0…4, default 4, and 0 means off.
- `reps` defaults to `loaded.config.reps` (1…10). Concurrency defaults to `loaded.config.concurrency` (≤ 20), counted **per context**.
- A `leak` guard report aborts the whole run with `RunnerSafetyError`. `redirect` is reported as a blocked redirect, not a failure (D-22).
- A failed reset is a `systemError`, never an app bug (Req 2.7).
- Every event string, error message and file written passes through `loaded.redactor.redact` (Req 2.8). Traces of actors that ran a `login` step are not kept.
- Inputs only come from `generate(generator, seed, index)` (D-04). Each rep of a pair uses the same seed.
- Overlay colour is `--ecto` `#7dffb0`, and the overlay contains no text (D-24).
- No theme words in anything that reaches an LLM (none here). Invisible characters stay as `\uXXXX` escapes.
- Tests never reach the internet. Use `*.test` hosts with `--host-resolver-rules=MAP *.test 127.0.0.1`.
- `npm run health` must exit 0 after every task.

## Review Focus

1. **A plan whose identity has no session** (account removed by D-29, or scout failed login): expect `systemError` "no session for account X", not a crash. Pinned in Task 7.
2. **One actor fails before a shared barrier**: the other actor must not hang until the 60 s plan timeout. Expect the barrier to break and the rep to be a `planError`. Pinned in Task 2 (unit) and Task 7 (browser).
3. **A held request is never explicitly released because the actor failed mid-plan**: the request must still be let go when the actor ends, or the context close hangs. Pinned in Task 4.
4. **The app logs a console error only because the guard blocked an off-allowlist resource**: `noConsoleErrors` must still pass. Pinned in Task 6.
5. **An `api` assertion on a `forbidden` path** (for example `DELETE /api/admin/*`): it must never be sent. Expect assertion failure kind `blocked`. Pinned in Task 6.

---

## File Structure

```
packages/core/src/runner/
  types.ts        RunOptions, RunResult, PairRepResult, StepResult, AssertionResult, RunEvent, ActorName
  errors.ts       RunnerSafetyError
  seed.ts         pairSeed, DEFAULT_SEED
  match.ts        evalJsonPath, pathMatches, requestMatches, conflictKeys, planIdentity, blockAction
  schedule.ts     runScheduled (capacity in slots + conflict keys)
  barrier.ts      BarrierSet
  events.ts       createEventSink (onEvent + events.ndjson + frames on disk, redacted)
  holds.ts        installHolds
  overlay.ts      installOverlay, moveCursor, OVERLAY_COLOR
  throttle.ts     THROTTLE_PRESETS, applyThrottle
  frames.ts       startFrames
  actor.ts        runActor
  assertions.ts   runAssertions
  run.ts          runPlans
  index.ts        re-exports
packages/core/test/runner/
  claims-fixture.ts   tests-only app with a naive check-then-insert claim endpoint
  match.test.ts  schedule.test.ts  barrier.test.ts  events.test.ts
  page.test.ts   actor.test.ts     assertions.test.ts  run.test.ts  done-when.test.ts
```

Modify: `packages/core/src/index.ts` (export runner), `packages/core/src/config/reset.ts` (KI-29 env strip), `packages/core/test/safety/guard.test.ts` (KI-29 `evil.test`), plus the docs in Task 9.

---

### Task 1: Types and pure helpers

**Files:**
- Create: `packages/core/src/runner/types.ts`, `errors.ts`, `seed.ts`, `match.ts`
- Test: `packages/core/test/runner/match.test.ts`

**Interfaces:**
- Consumes: `HauntingPlan`, `Step`, `PlanTarget`, `stepType` (compiler/dsl), `BlockedRequest` (safety/guard), `StorageState` (scout/types), `ResetResult` (config/reset), `StepType` (personas).
- Produces:
  ```ts
  // types.ts
  export type ActorName = 'a' | 'b';
  export type StepOutcome = 'ok' | 'failed' | 'blocked-by-rule' | 'timeout';
  export type StepResult = { actor: ActorName; index: number; type: StepType; outcome: StepOutcome;
    startedAt: number; durationMs: number; note?: string; error?: string };
  export type AssertionResult = { index: number; type: string; ok: boolean; detail: string;
    failure?: 'app' | 'plan' | 'blocked' };
  export type RepOutcome = 'completed' | 'timeout' | 'planError' | 'systemError';
  export type PairRepResult = { criterion: string; persona: PersonaId; rep: number; outcome: RepOutcome;
    error?: string; steps: StepResult[]; assertions: AssertionResult[]; blocked: BlockedRequest[];
    artifacts: string[]; notes: string[]; startedAt: number; endedAt: number };
  export type RunOptions = { sessions: ReadonlyMap<string, StorageState>; outDir?: string; reps?: number;
    seed?: number; frameFps?: number; concurrency?: number; signal?: AbortSignal;
    onEvent?: (e: RunEvent) => void; stepTimeoutMs?: number; planTimeoutMs?: number };
  export type RunResult = { results: PairRepResult[]; reps: number; seed: number;
    resets: (ResetResult | null)[]; durationMs: number };
  export type RunEvent = { t: number } & (
    | { type: 'rep.started'; rep: number }
    | { type: 'reset.finished'; rep: number; ok: boolean; durationMs: number; error?: string }
    | { type: 'ghost.spawned'; ghostId: string; criterion: string; persona: PersonaId; rep: number; actor: ActorName }
    | { type: 'ghost.step'; ghostId: string; index: number; step: StepType; outcome: StepOutcome; x?: number; y?: number }
    | { type: 'ghost.frame'; ghostId: string; seq: number; jpegBase64: string }
    | { type: 'guard.blocked'; ghostId: string; reason: BlockReason; url: string }
    | { type: 'assert.result'; criterion: string; persona: PersonaId; rep: number; index: number; ok: boolean; detail: string }
    | { type: 'rep.finished'; rep: number; outcomes: Record<RepOutcome, number> });
  export type RunEventInput = DistributiveOmit<RunEvent, 't'>;   // define DistributiveOmit locally
  export const ghostId = (criterion: string, persona: string, rep: number, actor: ActorName) =>
    `${criterion}__${persona}__r${rep}__${actor}`;
  // errors.ts
  export class RunnerSafetyError extends Error { readonly blocked: BlockedRequest; readonly exitCode = 3 }
  // seed.ts
  export const DEFAULT_SEED = 1031;
  export function pairSeed(runSeed: number, criterion: string, persona: string): number; // uint32
  // match.ts
  export function evalJsonPath(value: unknown, path: string): { found: true; value: unknown } | { found: false; error: string };
  export function pathMatches(pattern: string, pathname: string): boolean;
  export function requestMatches(pattern: string, method: string, url: string, origin: string): boolean;
  export function conflictKeys(plan: HauntingPlan): string[];
  export function planIdentity(plan: HauntingPlan): { identity: string } | { error: string };
  export function blockAction(b: BlockedRequest): 'abort-run' | 'blocked-by-rule' | 'record';
  ```

- [ ] **Step 1: Write the failing tests** in `match.test.ts`:
  - `pairSeed`: same inputs → same value; different criterion or persona → different values; result is an integer in `[0, 2**32)`; throws `RangeError` for a non-uint32 run seed.
  - `evalJsonPath({claims:[1,2]}, '$.claims.length')` → `{found:true, value:2}`. `'$'` → the whole value. `'$.a[1].b'` on `{a:[{},{b:'x'}]}` → `'x'`. `'$.missing'` → `found:false`. A string `.length` works. Invalid syntax (`'claims'`, `'$..a'`, `"$['a']"`) → `found:false` with an error mentioning "unsupported".
  - `pathMatches('/market', '/market')` → true. `'/market'` vs `'/market/x'` → false. `'/trade/*'` vs `'/trade/new'` → true. `'/a*c'` vs `'/abc'` → true. Regex metacharacters in the pattern (`'/a.c'` vs `'/abc'`) → false.
  - `requestMatches('POST /api/claims', 'POST', 'http://127.0.0.1:4000/api/claims?x=1', 'http://127.0.0.1:4000')` → true. A different method → false. A different origin → false. `/api/claims/2` → false.
  - `conflictKeys`: a plan with `goto /claims` then `click {role:'button',name:'Claim'}` gives `['/claims|{"role":"button","name":"Claim"}']`. Without a goto it uses `plan.routes[0].path`. A `fill` target counts. Duplicates are removed. `press` and `wait` add nothing.
  - `planIdentity`: all-anonymous routes → `anonymous`. `[anonymous, default]` → `default`. `[default, other]` → `error` containing "two accounts".
  - `blockAction`: `leak` → `abort-run`. `forbidden` → `blocked-by-rule`. `host`, `scheme`, `redirect` → `record`.
- [ ] **Step 2: Run** `npx vitest run packages/core/test/runner/match.test.ts`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** `types.ts`, `errors.ts`, `seed.ts` and `match.ts`.
  - `pairSeed`: sha256 of `${runSeed}\u0000${criterion}\u0000${persona}`, read the first 4 bytes as a uint32 (big-endian).
  - JSON path grammar: `^\$((\.[A-Za-z_$][\w$]*)|(\[\d+\]))*$`. `.length` returns the length of an array or string.
  - `pathMatches`: escape the pattern for a regex, then turn `*` into `.*`, anchored.
  - Conflict key path: the actor's last `goto` before the step, else `plan.routes[0].path`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `F06: runner types and pure helpers (seed, JSON path, globs, conflict keys)`.

### Task 2: Scheduler and barrier set

**Files:**
- Create: `packages/core/src/runner/schedule.ts`, `barrier.ts`
- Test: `packages/core/test/runner/schedule.test.ts`, `barrier.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Job<T> = { keys: readonly string[]; slots: number; run: () => Promise<T> };
  /** Starts queued jobs in order whenever their keys are free and their slots fit. Slots are clamped to capacity. */
  export function runScheduled<T>(jobs: readonly Job<T>[], capacity: number, signal?: AbortSignal): Promise<PromiseSettledResult<T>[]>;
  export class BarrierSet {
    constructor(actors: readonly ActorName[]);
    /** Resolves 'released' when every live actor has arrived, or 'broken' if an actor left first. */
    arrive(name: string, actor: ActorName): Promise<'released' | 'broken'>;
    /** The actor ended (done, failed or timed out). Barriers it hasn't reached break. */
    leave(actor: ActorName): void;
    readonly releases: ReadonlyMap<string, number>;   // barrier name → release time (performance.now)
  }
  ```
- [ ] **Step 1: Write the failing tests.**
  - `schedule.test.ts`, using deferred promises to control completion:
    - capacity 2 and three keyless 1-slot jobs: two start at once, the third starts when one settles;
    - two jobs sharing a key never overlap, even with capacity 12;
    - a queued job whose keys are blocked doesn't block a later job with free keys (no head-of-line blocking);
    - a 2-slot job with capacity 1 still runs (clamped);
    - results come back in input order as `PromiseSettledResult` (a rejecting job → `rejected`);
    - a job throwing synchronously → `rejected`;
    - an aborted signal stops new starts: queued jobs settle as `rejected` with the signal's reason, and running ones finish;
    - `RangeError` for capacity < 1.
  - `barrier.test.ts`:
    - two actors: the first `arrive` stays pending until the second arrives, then both resolve `released` and `releases.get('fire')` is set;
    - one actor (`['a']`) is released immediately;
    - `leave('b')` while `a` waits on `fire` → `a` resolves `broken`;
    - `arrive` after the other actor already left → `broken` at once;
    - two barriers in sequence, each released independently.
- [ ] **Step 2: Run** `npx vitest run packages/core/test/runner/schedule.test.ts packages/core/test/runner/barrier.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** both. The scheduler keeps `running` keys in a `Map<string, number>` (key → count) and a `free` slot count. On every settle, it scans the queue front to back and starts each job that fits.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `F06: conflict-aware scheduler and barrier set`.

### Task 3: Event sink

**Files:**
- Create: `packages/core/src/runner/events.ts`
- Test: `packages/core/test/runner/events.test.ts`

**Interfaces:**
- Consumes: `Redactor` (config/redact), `RunEvent`, `RunEventInput`.
- Produces:
  ```ts
  export type EventSink = { emit(e: RunEventInput): void; frame(ghostId: string, jpeg: Buffer): void; flush(): Promise<void> };
  export function createEventSink(opts: { outDir?: string; redactor: Redactor; onEvent?: (e: RunEvent) => void; now?: () => number }): EventSink;
  ```
- [ ] **Step 1: Write the failing tests:**
  - an emitted event reaches `onEvent` with `t` from `now`;
  - with `outDir`, after `flush()`, `events.ndjson` holds one JSON line per event in order;
  - `frame()` emits a `ghost.frame` with `seq` 0, 1, … per ghost and writes `frames/<ghostId>/00000.jpg`, `00001.jpg` (`seq` padded to 5 digits). Frames never appear in ndjson;
  - secrets are redacted: `new Redactor(['s3cret'])`, an event with `url: 'http://x/?p=s3cret'` → `[REDACTED]` in both `onEvent` and the file (redact the serialized JSON);
  - an `onEvent` that throws is swallowed, and the file still gets the line;
  - without `outDir`, nothing is written and `flush()` resolves.
- [ ] **Step 2: Run** `npx vitest run packages/core/test/runner/events.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Serialize writes through one promise chain (`appendFile`, `mkdir -p` once). The redacted object for `onEvent` is `JSON.parse(redact(JSON.stringify(e)))`. Frames skip redaction (binary). `flush()` awaits the chain and rethrows the first write error.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `F06: run event sink (ndjson, frames, redaction)`.

### Task 4: Claims fixture and page helpers (holds, overlay, throttle, frames)

**Files:**
- Create: `packages/core/test/runner/claims-fixture.ts`, `packages/core/src/runner/holds.ts`, `overlay.ts`, `throttle.ts`, `frames.ts`
- Test: `packages/core/test/runner/page.test.ts`

**Interfaces:**
- Produces (fixture, tests only):
  ```ts
  export type ClaimsFixture = { origin: string; close(): Promise<void>;
    arrivals(): number[];  // performance.now() at each POST /api/claims arrival, since the last reset
    resets(): number; };
  export async function startClaimsFixture(): Promise<ClaimsFixture>;
  ```
  It reuses `USER`, `PASSWORD` and `SESSION` from `../scout/candy-fixture.js` and listens on `127.0.0.1:0`. Routes:
  - `/` home. `GET/POST /login` sets cookie `sid=SESSION` and 303s to `/claims`.
  - `/claims` (authed, else 302 `/login`): 12 buttons, `Claim Candy 1` … `Claim Candy 12`, plus `Claim Sour Skulls`. Each does `fetch('/api/claims', {method:'POST', body: JSON.stringify({candy})})` and then shows `<p>Claimed!</p>` or `<p role="alert">Already claimed</p>`.
  - `POST /api/claims`, **naive check-then-insert:** record the arrival; if `claims[candy].length > 0` → 409; else `await sleep(30)`; push; 201.
  - `GET /api/candies/<slug>` → `{claims:[...]}`.
  - `POST /__reset` clears state and increments `resets`.
  - `/form`: `<label for=n>Note</label><input id=n>` and a `Save` button that echoes the value into `<p data-testid="saved">`.
  - `/console`: `console.error('boom')` on load.
  - `/ext`: `fetch('http://evil.test/x')`, so the guard blocks it and Chromium logs "Failed to load resource".
  - `/throws`: `setTimeout(() => { throw new Error('kaboom') })`.
  - `/admin`: a `Delete all` button that fetches `DELETE /api/admin/all`.
  - `/hang`: a `Save` button whose `POST /api/hang` never answers.
- Produces (src):
  ```ts
  export type Holds = { hold(pattern: string): void; release(pattern: string): void; releaseAll(): void; held(pattern: string): number };
  export async function installHolds(context: BrowserContext, origin: string): Promise<Holds>; // call AFTER newGuardedContext
  export const OVERLAY_COLOR = '#7dffb0';
  export async function installOverlay(context: BrowserContext): Promise<void>;
  export async function moveCursor(page: Page, x: number, y: number): Promise<void>;
  export const THROTTLE_PRESETS: Record<'slow-3g' | 'fast-3g', { latency: number; downloadThroughput: number; uploadThroughput: number }>;
  // slow-3g: {latency: 2000, downloadThroughput: 50000, uploadThroughput: 50000}
  // fast-3g: {latency: 562.5, downloadThroughput: 180000, uploadThroughput: 84375}   (DevTools presets, bytes/s)
  export async function applyThrottle(page: Page, profile: 'slow-3g' | 'fast-3g'): Promise<void>;
  export async function startFrames(page: Page, fps: number, onFrame: (jpeg: Buffer) => void): Promise<() => Promise<void>>;
  ```
- [ ] **Step 1: Write the failing tests** in `page.test.ts`. Launch one browser with `guardLaunchOptions({args:['--host-resolver-rules=MAP *.test 127.0.0.1']})` and a guarded context per test, seeded with `storageState` that has the `sid` cookie for the fixture origin.
  - **Holds:** `hold('POST /api/claims')`, click `Claim Candy 1`; after 300 ms `arrivals()` is empty and `held(...)` is 1; `release(...)` → the arrival appears and `Claimed!` is visible. A request held when `releaseAll()` is called is released. Unmatched requests (`GET /api/candies/x`) pass straight through. A held request to a `forbidden` path is still aborted by the guard after release (holds fall back to the guard).
  - **Overlay:** after `installOverlay`, the page's `ariaSnapshot()` has no extra nodes and `page.getByText(/./)` counts the same as without the overlay. `moveCursor(page, 10, 20)` doesn't throw. A click on a button under the cursor position still lands (`Claimed!`). A host element exists whose shadow root is closed (`el.shadowRoot === null`).
  - **Throttle:** `applyThrottle(page, 'slow-3g')`, then a `fetch('/api/candies/x')` timed in the page takes ≥ 1500 ms. Both presets equal the values above.
  - **Frames:** `startFrames(page, 2, cb)` while the page animates (`requestAnimationFrame` colour change) for 1.6 s → cb is called between 1 and 5 times with Buffers starting `0xff 0xd8`. The returned stop function resolves, and nothing is called after it.
- [ ] **Step 2: Run** `npx vitest run packages/core/test/runner/page.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - holds: `context.route('**/*', handler)`. If an active hold matches via `requestMatches`, park on a promise; then `route.fallback()`.
  - overlay: `addInitScript` creates a `poltergeist-ghost` host with `aria-hidden="true"` and `attachShadow({mode:'closed'})`. Its child is a 14 px fixed, `pointer-events:none`, `z-index:2147483647` blob in `OVERLAY_COLOR`. The setter is stored on `window[Symbol.for('poltergeist.cursor')]`. Attach on `DOMContentLoaded` if `documentElement` isn't ready.
  - throttle: `context.newCDPSession(page)` → `Network.enable`, then `Network.emulateNetworkConditions({offline:false, ...preset})`.
  - frames: CDP `Page.startScreencast({format:'jpeg', quality:50, maxWidth:640, maxHeight:640})`. Always `Page.screencastFrameAck`. Forward a frame only if ≥ `1000/fps` ms passed since the last forwarded one. stop = `Page.stopScreencast` + detach, swallowing errors on a closed page.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `F06: claims fixture, request holds, ghost-cursor overlay, throttle and frames`.

### Task 5: Actor step executor

**Files:**
- Create: `packages/core/src/runner/actor.ts`
- Test: `packages/core/test/runner/actor.test.ts`

**Interfaces:**
- Consumes: `locateTarget`, `login` (scout/login), `generate` (personas), `Holds`, `BarrierSet`, `moveCursor`, `applyThrottle`, `StepResult`.
- Produces:
  ```ts
  export type ActorEnv = { actor: ActorName; page: Page; context: BrowserContext; origin: string;
    loaded: Pick<LoadedConfig, 'config' | 'redactor'>; holds: Holds; barriers: BarrierSet; seed: number;
    stepTimeoutMs: number; onStep(r: StepResult, xy?: { x: number; y: number }): void };
  export type ActorRun = { steps: StepResult[]; end: 'done' | 'failed' | 'timeout' | 'broken'; error?: string; loggedIn: boolean };
  export async function runActor(steps: readonly Step[], env: ActorEnv): Promise<ActorRun>;
  /** The step currently or most recently started, for guard attribution. */
  export function currentStep(run: ActorRun): StepResult | undefined;
  ```
  `runActor` pushes each `StepResult` into the returned `steps` array as soon as the step **starts**, and fixes up `outcome` and `durationMs` when it ends. So `run.ts` can find the step to mark `blocked-by-rule` while it's in flight. To make that possible, it returns a live object: export `startActor(steps, env): { run: ActorRun; done: Promise<ActorRun> }`, and make `runActor` a thin `await startActor(...).done`.
- Step semantics (D-33):
  - `goto` → `page.goto(new URL(path, origin).href, {waitUntil:'load'})`.
  - `click`/`dblclick`/`fill` → `locateTarget(page, t)`. If `count() > 1`, use `.first()` and set `note: 'N matches, used the first'`. Move the cursor to the bounding-box centre first, and pass `xy` to `onStep`.
  - `fill` value = `generate(gen, seed, fillOrdinal)`, where fillOrdinal counts this actor's fills from 0. The value is never put in the result or events.
  - `press` → `page.keyboard.press(key)`. `back`/`reload` → `goBack`/`reload` with `waitUntil:'load'`. `wait` → `waitForTimeout`. `throttle` → `applyThrottle`.
  - `barrier` → `barriers.arrive`, with no step timeout. `broken` ends the actor with `end:'broken'`.
  - `holdRequests`/`releaseRequests` → holds.
  - `login` → `login(page, config.accounts[account], {origin, deadline: Date.now()+stepTimeoutMs, redactor})`. Failure → `failed`. Sets `loggedIn`.
  - `logout` → `context.clearCookies()`, then clear `localStorage` and `sessionStorage` (errors ignored).
- Errors: `context.setDefaultTimeout(stepTimeoutMs)` and the navigation timeout too; also race each non-barrier step against `stepTimeoutMs + 250`. A Playwright `TimeoutError` or the race → step `timeout`, actor `end:'timeout'`. Any other error → step `failed`, `end:'failed'`, error redacted and cut to its first line. The actor stops at the first non-ok step. It always calls `barriers.leave(actor)` and `holds.releaseAll()` in `finally`.
- [ ] **Step 1: Write the failing tests** (`actor.test.ts`, claims fixture, a guarded context with the `sid` storageState, real `BarrierSet(['a'])` and `installHolds`):
  - goto `/claims` + click `Claim Candy 2` → all `ok`, `end:'done'`, `Claimed!` visible, `onStep` got `xy` for the click;
  - goto `/form`, fill `{label:'Note'}` with `naughty` → the input's value equals `generate('naughty', seed, 0)`, and running it again with the same seed gives the same value;
  - a missing target `{role:'button', name:'Nope'}` with `stepTimeoutMs: 400` → step `timeout`, `end:'timeout'`, finishes in < 2 s;
  - `/hang`, click `Save` then `goto /` → `ok` (the hanging fetch doesn't block steps);
  - `login {account:'default'}` on a fresh context without storageState → `ok` and `loggedIn: true`; then `logout` → `goto /claims` lands on `/login`;
  - two-actor barrier: `BarrierSet(['a','b'])`, actor b fails at a missing target before the barrier → actor a resolves `end:'broken'` well before the plan timeout;
  - `holdRequests 'POST /api/claims'` + click without a release, actor finishes → `arrivals()` gets the request (`releaseAll` in finally).
- [ ] **Step 2: Run** `npx vitest run packages/core/test/runner/actor.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `actor.ts` as specified.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `F06: actor step executor with timeouts, barriers and holds`.

### Task 6: Assertions

**Files:**
- Create: `packages/core/src/runner/assertions.ts`
- Test: `packages/core/test/runner/assertions.test.ts`

**Interfaces:**
- Consumes: `Assertion` (dsl), `locateTarget`, `evalJsonPath`, `pathMatches`, `compileForbidden`, `isAllowedHost`, `normalizeHost`.
- Produces:
  ```ts
  export type ConsoleRecord = { text: string; url: string };
  export type AssertEnv = { page: Page; context: BrowserContext; origin: string; allowedHosts: readonly string[];
    forbidden: ForbiddenMatcher; redactor: Redactor; consoleErrors: readonly ConsoleRecord[];
    pageErrors: readonly string[]; blockedUrls: ReadonlySet<string>; pollMs: number; deadline: number };
  export async function runAssertions(asserts: readonly Assertion[], env: AssertEnv): Promise<AssertionResult[]>;
  export const ASSERT_POLL_MS = 2000;
  ```
- Semantics:
  - `textVisible` → `page.getByText(text).first()` becomes visible within `pollMs`.
  - `textNotVisible` → every `getByText(text)` match is hidden within `pollMs`.
  - `urlMatches` → `pathMatches(pattern, new URL(page.url()).pathname)`, polled.
  - `elementCount` → `locateTarget(...).count() === equals`, polled.
  - `api` → resolve against `origin`. Off-allowlist host or a `forbidden` match → `ok:false, failure:'blocked'` and never sent. Else `context.request.fetch(url, {method, failOnStatusCode:false, timeout: 5000})`. `status` mismatch → `app`. `jsonPath` with invalid syntax → `plan`. A non-JSON body or a missing path → `app`. `equals` uses strict `===` (with `null`).
  - `noConsoleErrors` → console errors, excluding those whose `url` is in `blockedUrls` or whose text starts with `Failed to load resource` while a block happened on that page.
  - `noUncaughtExceptions` → `pageErrors` is empty.
  - Every `detail` is short and redacted. A Playwright error inside an assertion → `failure:'plan'`. Polling stops at `min(now + pollMs, deadline)`.
- [ ] **Step 1: Write the failing tests:** one passing case and one failing case per assertion type on the claims fixture, plus:
  - an `api` `DELETE /api/admin/all` with forbidden `[{method:'DELETE', path:'/api/admin/*'}]` → `failure:'blocked'`, and the fixture never saw the request;
  - `/ext` (guard-blocked fetch) with `noConsoleErrors` → ok;
  - `/console` → not ok, detail contains `boom`;
  - `/throws` → `noUncaughtExceptions` not ok;
  - `jsonPath: 'claims'` → `failure:'plan'`;
  - text that appears 500 ms after load → `textVisible` ok (polling).
- [ ] **Step 2: Run** `npx vitest run packages/core/test/runner/assertions.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** as specified.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `F06: plan assertions (text, url, count, api, console, exceptions)`.

### Task 7: `runPlans` orchestration

**Files:**
- Create: `packages/core/src/runner/run.ts`, `packages/core/src/runner/index.ts`
- Modify: `packages/core/src/index.ts` (add `export * from './runner/index.js';`)
- Test: `packages/core/test/runner/run.test.ts`

**Interfaces:**
- Consumes: everything above, plus `newGuardedContext`, `runReset`, `ResetError`.
- Produces: `export async function runPlans(browser: Browser, loaded: LoadedConfig, plans: readonly HauntingPlan[], opts: RunOptions): Promise<RunResult>;`
- Flow:
  1. Validate the options: `reps` 1…10, `frameFps` 0…4, `concurrency` 1…20, else `RangeError`. Create the sink and an internal `AbortController` linked to `opts.signal`.
  2. For each rep in 1…N: emit `rep.started`. Run `runReset(loaded)` and emit `reset.finished`. A `ResetError` gives every plan of this rep `systemError` with the redacted message, then the next rep. Otherwise `runScheduled(jobs, concurrency, signal)`, with job = `{keys: conflictKeys(plan), slots: actorCount, run: () => runPair(plan, rep)}`. Emit `rep.finished` with the outcome counts.
  3. `runPair`:
     - `planIdentity` error → `planError`. A non-anonymous identity missing from `sessions` → `systemError` "no session for account X".
     - For each actor: `newGuardedContext(browser, {allowedHosts, forbidden, onBlocked}, identity==='anonymous' ? {} : {storageState})`, `installHolds`, `installOverlay`, and `tracing.start({screenshots:true, snapshots:true})` when `outDir` is set. Then `newPage`, the `console`/`pageerror` listeners, `startFrames` when fps > 0 (frames → `sink.frame`), and emit `ghost.spawned`.
     - `onBlocked(b)`: push to `blocked`, emit `guard.blocked`, then apply `blockAction`. `abort-run` stores the first leak and aborts the controller. `blocked-by-rule` sets `currentStep(run).outcome` to `blocked-by-rule`.
     - Start the actors with `startActor` and race `Promise.all(done)` against the plan deadline. On timeout, close the contexts (which rejects pending actions) → `timeout`.
     - If every actor ended `done` → `runAssertions` with `deadline = planStart + planTimeoutMs` and emit each `assert.result`. Outcome: any actor `timeout` → `timeout`; `failed`/`broken` → `planError`; else `completed`.
     - Failed rep (outcome ≠ completed, or any assertion not ok) with `outDir`: write `artifacts/<criterion>__<persona>__rep<k>/screenshot-<actor>.png` when an assertion failed, and `trace-<actor>.zip`. For an actor whose run has `loggedIn`, call `tracing.stop()` without a path and add the note `trace dropped: actor ran a login step (secrets)`. Otherwise stop the trace without a path.
     - `finally`: stop frames and close the contexts. Errors there are swallowed.
     - Any unexpected throw inside `runPair` → `systemError` with the redacted first line.
  4. After the scheduler drains: if a leak was stored, `await sink.flush()` and throw `new RunnerSafetyError(leak)`. If `opts.signal` aborted, flush and throw `opts.signal.reason`. Otherwise flush and return.
- [ ] **Step 1: Write the failing tests** (`run.test.ts`). The config comes from `parseConfig` with the claims fixture origin, routes `/claims` (auth) and `/form`, account `default`, `resetCommand: node -e "fetch('<origin>/__reset',{method:'POST'})"`, forbidden `DELETE /api/admin/*`. Sessions come from `scout()` on the fixture. Use a helper `plan(criterion, persona, actors, assert, routes?)`.
  - A Wraith plan on `/claims` that dblclicks `Claim Candy 3` with `api $.claims.length equals 1`, `reps: 2`. The result has 2 records, each `completed`, and the assertion fails (the naive app double-claims on dblclick) or passes. Assert only that it's reproducible: the same `ok` in both reps. `fixture.resets()` increased by 2. `events.ndjson` contains `rep.started`, `reset.finished`, `ghost.spawned`, `ghost.step`, `assert.result` and `rep.finished`, in order per rep.
  - **Same inputs every rep:** a Banshee plan filling `Note` with `naughty`, `reps: 3` → `saved` text identical across reps (read it with an `elementCount`/`textVisible` on the generated value: compute `generate('naughty', pairSeed(seed,c,p), 0)` in the test).
  - **Failing reset:** `resetCommand: 'exit 3'` → every record `systemError`, and no contexts were created (no `ghost.spawned`).
  - **Missing session:** a plan whose route identity is `ghost` (not in sessions) → `systemError` containing `no session`.
  - **Two accounts** → `planError`.
  - **Forbidden step:** click `Delete all` on `/admin` → that step's outcome is `blocked-by-rule` (poll briefly: blocks arrive asynchronously, so the plan adds `wait 300` after the click), and the rep is `completed`.
  - **Plan timeout:** `planTimeoutMs: 1500`, `stepTimeoutMs: 5000`, an actor that waits on a barrier the other reaches only after `wait 2000 ×2` → outcome `timeout` within 3 s.
  - **Artifacts:** a failing `textVisible 'Nope'` with `outDir` → `artifacts/c__wraith__rep1/screenshot-a.png` and `trace-a.zip` exist and are listed in `artifacts`. A passing rep leaves no artifact folder. An actor with a `login` step on a failing rep → no `trace-a.zip`, and the note is present.
  - **Leak abort:** the leak path can't be triggered from a real page behind the dead proxy, so test the wiring with `vi.mock` of `../../src/runner/match.js`'s `blockAction` to return `'abort-run'` for `host` blocks. Visit `/ext` → `runPlans` rejects with `RunnerSafetyError`, and `events.ndjson` was flushed.
  - **External abort:** abort `signal` after the first `rep.finished` with `reps: 3` → rejects with the abort reason, and no `rep.started` for rep 3.
  - `RangeError` for `reps: 0`, `frameFps: 5`, `concurrency: 21`.
- [ ] **Step 2: Run** `npx vitest run packages/core/test/runner/run.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `run.ts` and `index.ts` (export the public API: `runPlans`, the types, `RunnerSafetyError`, `pairSeed`, `DEFAULT_SEED`, `ghostId`, `OVERLAY_COLOR`, `THROTTLE_PRESETS`). Add the core export.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `F06: runPlans orchestration (reps, reset, contexts, artifacts, leak abort)`.

### Task 8: Done-when on the fixture, and KI-29 folds

**Files:**
- Create: `packages/core/test/runner/done-when.test.ts`
- Modify: `packages/core/src/config/reset.ts`, `packages/core/test/config/reset.test.ts` (or wherever `runReset` is tested), `packages/core/test/safety/guard.test.ts`

- [ ] **Step 1: Write the failing tests.**
  - `done-when.test.ts`:
    - **Barrier < 50 ms:** a Doppelgänger plan with `a = b = [goto /claims, barrier fire, click Claim Sour Skulls, wait 500]` and `assert [{api: GET /api/candies/sour-skulls, jsonPath $.claims.length, equals 1}]`, `reps: 3`. After each rep (inspect `fixture.arrivals()` per rep through `onEvent` on `rep.finished`), the two arrivals are < 50 ms apart.
    - **Race found (KI-07):** the assertion fails in ≥ 2 of 3 reps.
    - **12 ghosts:** 12 Wraith plans (criteria `1.1`…`1.12`), each dblclicking a different `Claim Candy k`, `concurrency: 12`, `reps: 1`. Max overlap of `[startedAt, endedAt]` across records = 12, and the whole run finishes in < 60 s on the fixture. The < 5 min on real Candy Swap is KI-36.
  - `runReset` test: with `env: { ...process.env, ANTHROPIC_API_KEY: 'sk-test-xyz', DOPPLER_TOKEN: 'dp.st.xyz' }` and `resetCommand: 'echo "$ANTHROPIC_API_KEY $DOPPLER_TOKEN"'`, `outputTail` contains neither value.
- [ ] **Step 2: Run** `npx vitest run packages/core/test/runner/done-when.test.ts packages/core/test/config`. Expected: the reset test FAILs. The Done-when tests should pass already. If one doesn't, fix the runner, not the test.
- [ ] **Step 3: Implement.**
  - In `runReset`, spawn with `env` minus `PROVIDER_ENV_KEYS = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'DOPPLER_TOKEN', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN']`.
  - In `guard.test.ts`, replace every `example.com` navigation target with `evil.test` (allowlist and classify tests are pure and stay as they are).
- [ ] **Step 4: Run** `npm run health`, then `npm run test:guard:1cpu` and `taskset -c 0 npx vitest run packages/core/test/runner`. Expected: all green.
- [ ] **Step 5: Commit** `F06: Done-when on fixture (barrier < 50 ms, race found, 12 ghosts), KI-29 reset env and evil.test`.

### Task 9: Close the cycle (docs)

**Files:** `.kiro/specs/poltergeist/design.md` (§8 add `rep.started`, `reset.finished`, `rep.finished` and the `runPlans` API line; §9 `trace-<actor>.zip`, `screenshot-<actor>.png`), `docs/PRD.md` (F06 status `Done (fixture; real Candy Swap check pending, KI-36)` and a changelog line), `.kiro/specs/poltergeist/tasks.md` (tick F06), `docs/KNOWN_ISSUES.md` (KI-07, KI-10, KI-18, KI-29, KI-35 notes; summary table), `docs/DECISIONS.md` (D-33 implementation notes if anything changed), `AGENTS.md` (current state and do-first).

- [ ] **Step 1:** Make the doc edits above.
- [ ] **Step 2:** Run `npm run health`. Expected: exit 0.
- [ ] **Step 3: Commit** `F06: close cycle (design, PRD, tasks, KIs, AGENTS)`.
