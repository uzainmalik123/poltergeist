# F05 Ghost Compiler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `@poltergeist/core` exposes `compile(criteria, scout, opts)`, which turns every criterion × persona pair into a validated Haunting Plan, a justified `notApplicable`, or an `uncompilable` with reasons. It caches results, so a second run makes zero LLM calls (Requirement 5).

**Architecture:** There's one folder, `packages/core/src/compiler/`:
- `dsl.ts`: the zod DSL, the single definition of the LLM contract.
- `validate.ts`: semantic checks against the persona and the picked routes' Scout output.
- `routes.ts`: deterministic route picking.
- `prompt.ts`: the plain-QA prompt and `PROMPT_VERSION`.
- `cache.ts`: the plan cache.
- `llm.ts`: the `LlmClient` boundary and the Anthropic adapter.
- `compile.ts`: orchestration through `createLimiter`.

Tests never call the network: they inject a fake `LlmClient`.

**Tech Stack:** TypeScript 5.9.3, Node ≥ 22, zod 4.6.7, `@anthropic-ai/sdk` 1.3.0 (new, pinned exactly), vitest 4.1.12, playwright-core 1.64.1 (Done-when test only).

**Spec:** `.kiro/specs/poltergeist/requirements.md` Req 5.1–5.6 · `design.md` §4 (types), §6 (DSL), §9 (run folder) · `docs/PRD.md` F05 · `docs/DECISIONS.md` D-03, D-04, D-09, D-15, D-21, D-30, D-31, **D-32** · KI-03, KI-11, KI-32, KI-34.

## Global Constraints

- Fresh code only (D-25). Never open `../poltergeist-old`.
- Versions are pinned exactly (`npm i -E -w @poltergeist/core @anthropic-ai/sdk@1.3.0`). Update STACK.md's "Installed here?" column.
- `npm run health` stays green after every task (D-19).
- The LLM never writes input values (D-04, D-32): `fill.input` is only `{ generator: GeneratorId }`, and there is no `literal`.
- Targets are only `{role,name}`, `{label}`, `{text}` or `{testId}`, and only ones Scout emitted on the **picked** routes (D-15, D-21, Req 5.4).
- At most 2 routes per criterion (Req 5.1, KI-03). Only `status: 'ok'` routes are candidates.
- At most 4 concurrent LLM calls (PRD F05). Exactly one retry with the errors fed back (Req 5.2).
- Prompts use plain QA wording and contain no theme words, persona ids or persona names (D-09, Req 5.6). The compiler stamps the persona onto the plan afterwards.
- Default model: the config's `model` (`claude-sonnet-5-5`). Structured output goes through `client.messages.parse` with `output_config.format = zodOutputFormat(LlmOutputSchema)` from `@anthropic-ai/sdk/helpers/zod`, `max_tokens: 16000`, non-streaming. Our own zod and semantic validation always re-runs on the raw text.
- Commit messages are `F05: <what>`, ending with the `Co-Authored-By` line from the session.
- Tests live in `packages/core/test/compiler/`, mirroring `src/compiler/`. The folder exports through `src/compiler/index.ts`, and `src/index.ts` re-exports it.

## Review Focus

1. **A target that exists on a different, unpicked route.** The model sees one route but names a button from another. Reject it, retry, and never accept it. Pinned in Task 2.
2. **Truncated or non-JSON model output** (`stop_reason: max_tokens`, prose around the JSON). Treat it as a validation failure (retry, then `uncompilable`), never a crash. Pinned in Task 7.
3. **A corrupt, half-written or stale-schema cache file.** Treat it as a miss and overwrite it, never throw. Pinned in Task 5.
4. **A criterion whose only matching routes are `unreachable` or `authFailed`.** Mark it `uncompilable` (`no matching route`) without an LLM call. Pinned in Task 3.
5. **An unknown persona id in `opts.personas`** (`'Wraith'`, `'__proto__'`). Throw `UnknownPersonaError` before any call. Pinned in Task 7.

---

### Task 1: DSL schema (structural contract)

**Files:**
- Modify: `packages/core/package.json` (add `@anthropic-ai/sdk` 1.3.0 via `npm i -E`), `docs/STACK.md`
- Create: `packages/core/src/compiler/dsl.ts`, `packages/core/src/compiler/index.ts`
- Modify: `packages/core/src/index.ts` (add `export * from './compiler/index.js';`)
- Test: `packages/core/test/compiler/dsl.test.ts`

**Interfaces:**
- Consumes: `STEP_TYPES`, `GENERATOR_IDS`, `PersonaId` from `core/personas`.
- Produces (all exported from `dsl.ts`):
  - `TargetSchema`. Type `Target = {role:string;name:string} | {label:string} | {text:string} | {testId:string}` (strict objects).
  - `PRESS_KEYS = ['Enter','Tab','Escape','Space','Backspace','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'] as const`.
  - `THROTTLE_PROFILES = ['slow-3g','fast-3g'] as const`.
  - `REQUEST_PATTERN = /^(GET|POST|PUT|PATCH|DELETE) \/\S*$/` (used by `holdRequests` / `releaseRequests`).
  - `StepSchema`: a union of strict single-key objects: `{goto:string}`, `{click:Target}`, `{dblclick:Target}`, `{fill:{target:Target; input:{generator:GeneratorId}}}`, `{press:PressKey}`, `{back:true}`, `{reload:true}`, `{wait:int}`, `{throttle:{profile}}`, `{barrier:string}`, `{holdRequests:string}`, `{releaseRequests:string}`, `{login:{account:string}}`, `{logout:true}`. Type `Step`.
  - `stepType(step: Step): StepType`: the step's single key.
  - `AssertionSchema`: `{textVisible:string}`, `{textNotVisible:string}`, `{urlMatches:string}`, `{elementCount:{target:Target; equals:int}}`, `{api:{method:'GET'|'POST'|'PUT'|'PATCH'|'DELETE'; path:string; jsonPath?:string; status?:int; equals?: string|number|boolean|null}}`, `{noConsoleErrors:true}`, `{noUncaughtExceptions:true}`. Type `Assertion`.
  - `ActorsSchema = {a: Step[]; b?: Step[]}`.
  - `LlmOutputSchema = z.strictObject({ result: z.discriminatedUnion('kind', [ {kind:'plan', intent:string, actors, assert: Assertion[]}, {kind:'notApplicable', reason:string} ]) })`. The wrapper exists because the structured-output root must be an object. Type `LlmOutput`.
  - Type `PlanRoute = { path: string; identity: string }`.
  - Type `HauntingPlan = { criterion: string; persona: PersonaId; intent: string; routes: PlanRoute[]; actors: Actors; assert: Assertion[] }`, plus `HauntingPlanSchema` (used by the cache reader).

- [ ] **Step 1: Install the SDK** with `npm i -E -w @poltergeist/core @anthropic-ai/sdk@1.3.0` and add its row to STACK.md (installed: yes, core).
- [ ] **Step 2: Write the failing tests** in `dsl.test.ts`:
  - `parses the design §6 doppelganger example body` (with `criterion`, `persona` and `routes` removed, wrapped as `{result:{kind:'plan',…}}`) → `success === true`.
  - `rejects fill with a literal input`: `{fill:{target:{label:'Offer'},input:{literal:'x'}}}` fails.
  - `rejects a step with two keys`: `{click:{text:'A'}, back:true}` fails. Also `rejects a raw CSS target`: `{click:{css:'#a'}}` fails.
  - `step enum matches STEP_TYPES`: building one valid example per `STEP_TYPES` entry parses, and `stepType` returns that entry.
  - `accepts notApplicable with a reason`: `{result:{kind:'notApplicable',reason:'No form on these pages.'}}`.
  - `zodOutputFormat accepts the schema`: `zodOutputFormat(LlmOutputSchema)` doesn't throw.
- [ ] **Step 3: Run** `npx vitest run packages/core/test/compiler/dsl.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 4: Implement `dsl.ts`.** Build the step and generator enums with `z.enum(STEP_TYPES)` / `z.enum(GENERATOR_IDS)`. Use `z.strictObject` everywhere. Put no `min`/`max`/`regex` on fields the model sees: those are checked in Task 2 with clear messages.
- [ ] **Step 5: Run** the test. Expected: PASS. Then run `npm run health`.
- [ ] **Step 6: Commit** `F05: DSL zod schema and Anthropic SDK`.

### Task 2: Semantic validation

**Files:**
- Create: `packages/core/src/compiler/validate.ts`
- Test: `packages/core/test/compiler/validate.test.ts`, `packages/core/test/compiler/scout-fixtures.ts` (hand-built `RouteScout` objects for `/market` (identity `default`) and `/trade/new` (identity `default`), with the same elements as `test/scout/candy-fixture.ts`: button `Claim Sour Skulls` with testId `claim-sour-skulls`, button `Claim Candy Corn` with count 2, testIds `market-status` and `candy-card`, textboxes labelled `Offer` and `Note`, combobox `Want`, button `Propose trade`, testId `trade-status`; plus `/` as `unreachable`)

**Interfaces:**
- Consumes: Task 1 types, `Persona`, `RouteScout`.
- Produces: `validatePlan(body: Extract<LlmOutput['result'],{kind:'plan'}>, ctx: { persona: Persona; routes: RouteScout[] }): string[]`. It returns human-readable errors (empty when valid). Each error is prefixed with a path such as `actors.b[2].click:` or `assert[0].api.path:`.

Rules, one error per violation:
- `intent` and every string field are non-empty after trim. `intent` and `reason` are ≤ 300 chars.
- Actor count: `persona.actors === 2` needs `a` and `b`; `persona.actors === 1` forbids `b`. Each actor has ≥ 1 step and ≤ 30 steps.
- Every step type is in `persona.allowedSteps`. Every generator is in `persona.generators`.
- `goto` equals one of the picked routes' `path`.
- Targets resolve on the picked routes only:
  - `{role,name}`: an `interactive` entry with the same role and name.
  - `{label}`: an `interactive.label`.
  - `{testId}`: an `interactive.testId` or a `testIds[].testId`.
  - `{text}`: an `interactive.name` or a `testIds[].name`.
- `wait` is an integer 0…2000. `press` was enforced in Task 1. `holdRequests` / `releaseRequests` match `REQUEST_PATTERN`.
- Within an actor, every `holdRequests X` has a later `releaseRequests X`, and no `releaseRequests` comes before its hold.
- Every `barrier` name appears exactly once in **every** actor.
- `login.account` is a non-anonymous identity seen in the routes.
- `assert` has 1…10 entries. `urlMatches` and `api.path` start with `/` and not `//`. `api.status` is an integer 100…599. `elementCount.target` resolves like a step target, and `equals` ≥ 0.

- [ ] **Step 1: Write the failing tests.** `valid doppelganger plan on /market has no errors` (doppelganger persona from `getPersona`), then one test per rule, each asserting `errors` contains the substring:
  - `target from an unpicked route is rejected`: clicking `Propose trade` with only `/market` picked → `/not found on the picked routes/`.
  - `banshee may not dblclick` → `/not allowed for this persona/`.
  - `wraith may not use naughty generator` → `/generator "naughty" not allowed/`.
  - `doppelganger needs actor b` → `/needs 2 actors/`.
  - `barrier missing from actor b` → `/barrier "fire" is not reached by actor b/`.
  - `hold without release` → `/never released/`.
  - `wait 2500` → `/0…2000/`.
  - `goto /vault (not picked)` → `/not a picked route/`.
  - `api path https://x.test/a` → `/must start with \//`.
  - `empty assert` → `/at least one assertion/`.
- [ ] **Step 2: Run** `npx vitest run packages/core/test/compiler/validate.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `validatePlan`.** Build one lookup set per target kind from the picked routes up front.
- [ ] **Step 4: Run** the tests. Expected: PASS. Then run `npm run health`.
- [ ] **Step 5: Commit** `F05: semantic plan validation`.

### Task 3: Deterministic route picking (KI-03)

**Files:**
- Create: `packages/core/src/compiler/routes.ts`
- Test: `packages/core/test/compiler/routes.test.ts`

**Interfaces:**
- Consumes: `Criterion`, `RouteScout`.
- Produces: `tokenize(s: string): Set<string>` and `pickRoutes(criterion: Criterion, routes: readonly RouteScout[]): RouteScout[]` (0–2 entries).

The algorithm (D-32):
- **`tokenize`:**
  - Lowercase, then split on `/[^\p{L}\p{N}]+/u`, which also splits `Swap_Offer`, `trade-status` and `/trade/new`.
  - Drop tokens shorter than 3 characters, and drop stop words (`STOP_WORDS`, exported):
    `the and for with that this from into each every when while where then shall should must not are its their user system app page can has have been will only one any all`.
  - Strip one trailing `s` from tokens longer than 3 characters.
- **Route tokens:** `tokenize` over the path, title, every `interactive.name`, `label` and `testId`, and every `testIds[].testId` and `name`.
- **Score:** the size of the intersection with `tokenize(criterion.text)`.
- **Candidates:** only `status === 'ok'`. Sort by score descending, then by index in `routes`. Return the first ≤ 2 with score > 0.

- [ ] **Step 1: Write the failing tests.**
  - `claim criterion picks /market only`: `"WHEN two sessions claim Sour Skulls at once, THE Market SHALL accept only one claim."` → `['/market']`.
  - `trade criterion picks /trade/new first`.
  - `no overlap → []`.
  - `unreachable route never picked, even if it matches` (Review Focus 4).
  - `at most two, ties in config order`: three equally scoring routes → the first two.
  - `tokenize splits snake, kebab and paths, drops stop words, singularises`: `tokenize('THE Swap_Offer claims /trade/new')` equals `{'swap','offer','claim','trade','new'}`.
- [ ] **Step 2: Run** `npx vitest run packages/core/test/compiler/routes.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `routes.ts`.
- [ ] **Step 4: Run** the tests. Expected: PASS. Then run `npm run health`.
- [ ] **Step 5: Commit** `F05: deterministic route picker (KI-03)`.

### Task 4: Prompt

**Files:**
- Create: `packages/core/src/compiler/prompt.ts`, `packages/core/test/helpers/theme-words.ts` (move `THEME_WORDS` out of `registry.test.ts` and import it there)
- Modify: `packages/core/test/personas/registry.test.ts`
- Test: `packages/core/test/compiler/prompt.test.ts`

**Interfaces:**
- Consumes: `Criterion`, `Persona`, `RouteScout`, `listGenerators`, `PRESS_KEYS`.
- Produces:
  - `PROMPT_VERSION = 'f05-1'`.
  - `SYSTEM_PROMPT: string`.
  - `buildUserPrompt(criterion: Criterion, persona: Persona, routes: RouteScout[]): string`.
  - `buildRetryPrompt(errors: string[]): string`.

What `SYSTEM_PROMPT` must say, in plain QA wording:
- The task is edge-case end-to-end test generation for a web app the user owns and runs locally (Req 5.6).
- Write one test plan for one acceptance criterion and one user behaviour.
- Use only the listed steps, only targets copied exactly from the page data, and only the listed input generator ids. Never invent input values.
- Assertions must check what the criterion promises. Prefer `api` assertions against the app's own read endpoints when the UI can't show it.
- When the behaviour can't meaningfully exercise this criterion on these pages, answer `notApplicable` with a one-sentence reason.

`buildUserPrompt` contains:
- the criterion id, its text, and its EARS clauses when present;
- the behaviour text (`persona.behaviour` only, never `id` or `name`) and the number of actors (`a`, or `a` and `b`);
- the allowed steps and the allowed generators with their descriptions;
- the press keys;
- for each route: path, title, and `JSON.stringify({interactive, testIds})`, then `snapshot`.

`buildRetryPrompt` lists the errors and asks for a corrected answer in the same format.

- [ ] **Step 1: Write the failing tests.**
  - `prompt has no theme words, persona ids or names`: for every persona × the `/market` fixture route, lowercase `SYSTEM_PROMPT + buildUserPrompt(...)` contains no `THEME_WORDS` entry. (The fixture route contains no theme words; app content is out of our control and isn't tested.)
  - `user prompt lists only the persona's steps and generators`: the banshee prompt contains `naughty` and not `dblclick`.
  - `user prompt includes the criterion id, text and the route snapshot`.
  - `retry prompt lists each error`.
  - `system prompt says the app is the user's own` (`/own/`).
- [ ] **Step 2: Run** `npx vitest run packages/core/test/compiler/prompt.test.ts packages/core/test/personas/registry.test.ts`. Expected: FAIL (prompt module missing).
- [ ] **Step 3: Implement** `prompt.ts` and the helper move.
- [ ] **Step 4: Run** the tests. Expected: PASS. Then run `npm run health`.
- [ ] **Step 5: Commit** `F05: plain-QA prompt`.

### Task 5: Plan cache

**Files:**
- Create: `packages/core/src/compiler/cache.ts`
- Test: `packages/core/test/compiler/cache.test.ts`

**Interfaces:**
- Consumes: `Persona`, `listGenerators`, `HauntingPlanSchema`, `PlanRoute`.
- Produces:
  - `personaHash(persona: Persona): string`: sha256 (first 16 hex) over canonical JSON `{behaviour, allowedSteps, generators: [{id, description}], actors}`.
  - `cacheKey(k: { criterionHash: string; personaId: PersonaId; personaHash: string; routes: { path: string; identity: string; routeHash: string }[]; model: string; promptVersion: string }): string`: sha256 (first 32 hex). Routes are serialised as sorted `path@identity:routeHash` strings, because `routeHash` alone doesn't cover the path.
  - Type `CachedResult = { kind: 'plan'; plan: HauntingPlan } | { kind: 'notApplicable'; reason: string; routes: PlanRoute[] }`.
  - `readCache(dir: string, key: string): Promise<CachedResult | undefined>`.
  - `writeCache(dir: string, key: string, value: CachedResult): Promise<void>`: writes `<dir>/<key>.json` atomically (tmp file + `rename`), with `mkdir -p`.

- [ ] **Step 1: Write the failing tests.**
  - `round-trips a plan and a notApplicable`.
  - `missing file → undefined`.
  - `corrupt JSON → undefined`, and `wrong shape → undefined` (Review Focus 3).
  - `key changes with each input`: change in turn the model, promptVersion, personaHash, one routeHash, and one route path with an equal routeHash → 5 distinct keys.
  - `key ignores route order`.
  - `personaHash changes when behaviour changes, not when name or tagline change`.
- [ ] **Step 2: Run** `npx vitest run packages/core/test/compiler/cache.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `cache.ts`.
- [ ] **Step 4: Run** the tests. Expected: PASS. Then run `npm run health`.
- [ ] **Step 5: Commit** `F05: plan cache`.

### Task 6: LLM boundary and Anthropic adapter

**Files:**
- Create: `packages/core/src/compiler/llm.ts`, `packages/core/src/compiler/errors.ts`
- Test: `packages/core/test/compiler/llm.test.ts`

**Interfaces:**
- Produces:
  - `class CompilerError extends Error` with `name = 'CompilerError'`, `exitCode = 2`, and `kind: 'auth'`. It's thrown for authentication and permission failures, which abort the whole compile.
  - `type LlmTurn = { role: 'user'; text: string } | { role: 'assistant'; raw: unknown }`. `raw` is opaque and replayed unchanged, so a retry is append-only.
  - `type LlmRequest = { model: string; system: string; turns: LlmTurn[]; meta: { criterion: string; persona: PersonaId; attempt: 1 | 2 } }`. `meta` is for fakes and logs only. It never reaches the API.
  - `type LlmResponse = { kind: 'output'; text: string; stopReason: string | null; raw: unknown } | { kind: 'refusal'; detail: string }`.
  - `interface LlmClient { complete(req: LlmRequest): Promise<LlmResponse> }`.
  - `createAnthropicClient(opts?: { anthropic?: Pick<Anthropic, 'messages'>; maxTokens?: number }): LlmClient`. The default is `new Anthropic()`, created lazily on the first `complete`, so it uses the SDK's credential resolution and default `maxRetries`.
- Adapter behaviour:
  - Calls `messages.parse({ model, max_tokens: maxTokens ?? 16000, system, messages, output_config: { format: zodOutputFormat(LlmOutputSchema) } })`.
  - Maps turns to `{role:'user', content:text}` / `{role:'assistant', content: raw}`.
  - `stop_reason === 'refusal'` → `{kind:'refusal', detail: stop_details?.category ?? 'refused'}`.
  - Otherwise returns the concatenated `text` blocks, `stop_reason` and `raw: response.content`. Ignore `parsed_output`: validation is ours.
  - `Anthropic.AuthenticationError` / `Anthropic.PermissionDeniedError` → throw `CompilerError` (message without the key). Any other error is rethrown unchanged.
- No refusal `fallbacks` parameter: a fallback model would produce plans cached under the wrong model key. KI-11 expects about zero refusals.

- [ ] **Step 1: Write the failing tests**, using a stub `{ messages: { parse: vi.fn() } }`:
  - `sends system, mapped turns, model and json output format`: assert the call's `output_config.format.type === 'json_schema'`, that `meta` is absent, and that `max_tokens` is 16000.
  - `returns text, stop reason and raw content`.
  - `maps refusal`.
  - `auth error → CompilerError`: the stub rejects with `new Anthropic.AuthenticationError(...)` (build it with the SDK's constructor, adapting the arguments to what the type checker requires).
  - `other errors pass through`.
- [ ] **Step 2: Run** `npx vitest run packages/core/test/compiler/llm.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `llm.ts` and `errors.ts`.
- [ ] **Step 4: Run** the tests. Expected: PASS. Then run `npm run health`.
- [ ] **Step 5: Commit** `F05: LlmClient boundary and Anthropic adapter`.

### Task 7: `compile()` orchestration

**Files:**
- Create: `packages/core/src/compiler/compile.ts`
- Modify: `packages/core/src/compiler/index.ts` (export everything public from Tasks 1–7)
- Test: `packages/core/test/compiler/compile.test.ts`, `packages/core/test/compiler/fake-llm.ts` (`fakeLlm(responder: (req: LlmRequest) => LlmResponse | Promise<LlmResponse>)` → `{ client, calls: LlmRequest[], maxInFlight: number }`)

**Interfaces:**
- Consumes: everything above, plus `createLimiter`, `getPersona` and `PERSONA_IDS`.
- Produces:
  - `compile(criteria: readonly Criterion[], scout: { routes: readonly RouteScout[] }, opts: CompileOptions): Promise<CompileResult>`.
  - `type CompileOptions = { client: LlmClient; model: string; cacheDir: string; outDir?: string; personas?: readonly string[]; concurrency?: number; onPlan?: (r: PairResult) => void }`. `concurrency` defaults to 4 and is an integer 1…4, otherwise `RangeError`.
  - `type PairResult` has these variants:
    - `{ status: 'compiled'; criterion: string; persona: PersonaId; plan: HauntingPlan; cached: boolean; attempts: 0 | 1 | 2 }`
    - `{ status: 'notApplicable'; criterion; persona; reason: string; routes: PlanRoute[]; cached; attempts }`
    - `{ status: 'uncompilable'; criterion; persona; reason: string; errors: string[]; attempts }`
  - `type CompileResult = { pairs: PairResult[]; llmCalls: number; cacheHits: number }`. `pairs` are in criteria order × `PERSONA_IDS` order, whatever order they complete in.

Per pair (D-32):
1. Resolve personas first (`getPersona`, Review Focus 5).
2. Run `pickRoutes`. With none: `uncompilable`, reason `no matching route`, `attempts: 0`, no call.
3. Compute the cache key. On a hit, return it with `cached: true` and `attempts: 0`.
4. Otherwise, call through the limiter.
   - Outcomes:
     - **Refusal:** `uncompilable`, reason `refused: <detail>`.
     - **Thrown `CompilerError`:** rethrow, which rejects `compile`.
     - **Any other throw:** `uncompilable`, reason `llm error: <message>`.
     - **Output:**
       - `JSON.parse` failure, or `stopReason === 'max_tokens'`: one error `output was not valid JSON (stop reason: …)`.
       - Otherwise `LlmOutputSchema.safeParse`: zod issues become `path: message` errors.
       - Then `validatePlan` for plans.
   - On errors, attempt 2 appends `{role:'assistant', raw}` and `{role:'user', text: buildRetryPrompt(errors)}`. Still failing → `uncompilable`, reason `invalid plan after retry`, with the errors.
5. Valid results stamp `criterion`, `persona` and `routes` (`{path, identity}` of the picked routes) and are cached. `uncompilable` is never cached.
6. With `outDir`, write `<outDir>/plans/<criterion>__<persona>.json` (the `PairResult`, pretty JSON) for every pair. Call `onPlan` per pair.

- [ ] **Step 1: Write the failing tests** with the Task 2 scout fixtures and `fakeLlm`:
  - `compiles a valid plan on the first try`: attempts 1, cached false, `plan.routes` is `[{path:'/market', identity:'default'}]`, `plan.persona` stamped.
  - `retries once with errors, then succeeds`: the 2nd request's turns end with the assistant raw and a user text containing the first error.
  - `uncompilable after two invalid answers`, with `errors` non-empty and 2 calls.
  - `non-JSON and max_tokens outputs trigger the retry` (Review Focus 2).
  - `accepts notApplicable with a reason`.
  - `refusal → uncompilable without retry` (1 call).
  - `network error → uncompilable "llm error"`.
  - `CompilerError rejects compile`.
  - `no matching route → uncompilable with zero calls` (Review Focus 4).
  - `second run is all cache hits with zero calls` (`llmCalls === 0`, `cacheHits === pairs that compiled or were notApplicable`).
  - `uncompilable is not cached`: a second run calls again.
  - `never more than 4 calls in flight`: 6 criteria × 3 personas with a delayed responder → `maxInFlight <= 4`. `concurrency: 5` → `RangeError`.
  - `unknown persona id throws before any call` (`'Wraith'`, `'__proto__'`).
  - `writes plans/<criterion>__<persona>.json for every pair`.
  - `pairs keep criteria × persona order`.
- [ ] **Step 2: Run** `npx vitest run packages/core/test/compiler/compile.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `compile.ts`.
- [ ] **Step 4: Run** the tests. Expected: PASS. Then run `npm run health`.
- [ ] **Step 5: Commit** `F05: compile orchestration, retry and cache`.

### Task 8: Done-when on the fixture, then close the cycle

**Files:**
- Create: `packages/core/test/fixtures/spec/candy-fixture/requirements.md`: Kiro-format, 5 criteria naming the fixture's market and trade pages, for example:
  - claiming Sour Skulls only once;
  - two sessions claiming at once;
  - the market status showing candies left;
  - a trade proposal with an empty offer being rejected;
  - a trade note accepting any text.
- Create: `packages/core/test/compiler/done-when.test.ts`
- Modify: `docs/PRD.md` (F05 status `Done (fixture; live check pending, KI-34)`, a note under the section, changelog), `.kiro/specs/poltergeist/tasks.md` (tick 7 with the same caveat), `.kiro/specs/poltergeist/design.md` §6 (no `literal`, the `{result:{kind}}` wrapper, compiler-stamped `routes: [{path, identity}]`, the press-key list, the `compile()` API line), `docs/DECISIONS.md` D-32 (the failure bullet should say "authentication or permission errors abort with `CompilerError`", because the SDK resolves credentials beyond `ANTHROPIC_API_KEY`), `docs/KNOWN_ISSUES.md` (KI-34 next action names this test; add any review leftovers), `AGENTS.md` (current state, next step), `docs/STACK.md`.

- [ ] **Step 1: Write the test**, using the same browser setup as `test/scout/scout.test.ts`:
  - Start `startCandyFixture()` and scout `/`, `/market` and `/trade/new` as `default`.
  - Run `parseSpec` on the new fixture spec.
  - `compile` with a scripted `fakeLlm`. The responder reads `meta` and the user prompt, and answers each pair with a plan built only from targets that appear in that prompt's route JSON, or with `notApplicable` where the persona can't apply.
  - Assert `(compiled + notApplicable) / pairs >= 0.8`.
  - Compile again with a fresh fake and assert `llmCalls === 0`.
- [ ] **Step 2: Run** `npx vitest run packages/core/test/compiler/done-when.test.ts`. Expected: PASS. If a scripted plan fails validation, fix the validator or the script, never loosen the check.
- [ ] **Step 3: Update the docs** listed above, and run `npm run health`. Expected: exit 0.
- [ ] **Step 4: Commit** `F05: Done-when on fixture, close cycle (PRD, tasks, design, D-32, KI-34, AGENTS)`.
