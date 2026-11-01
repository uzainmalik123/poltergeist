# F11 Kiro MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `poltergeist-mcp` is a stdio MCP server through which Kiro's agent can list criteria, summon the ghosts, poll a run, read the report and rehaunt a subset. Every result stays under 2k tokens.

**Architecture:**
- A new `packages/mcp` (`@poltergeist/mcp`) is a thin front door over core's `summon()` (design §1).
- A `RunManager` keeps at most one background run per process. Run tools **long-poll**: they wait up to `waitMs` for the result and otherwise return `status: 'running'`, so the agent calls `get_run_status` (KI-12; Kiro's per-call timeout is reportedly 120 s and unverified).
- Paths resolve against a root (`--root`, default cwd) and must stay inside it.
- Built fixture-first on the claims fixture with a fake LLM (like D-36). The real Kiro loop on Candy Swap is a new KI.

**Tech Stack:** TypeScript (Node ≥ 22, ESM), `@modelcontextprotocol/sdk` 1.32.2 (`McpServer.registerTool`, `StdioServerTransport`, `InMemoryTransport` in tests), zod 4.6.7, tsx 4.23.15 (runs the bin), vitest.

**Spec:** `.kiro/specs/poltergeist/requirements.md` Req 10.1–10.2 · `docs/PRD.md` § F11 · design §1, §10, §11 · D-36 (summon API) · D-38 (this cycle's rulings) · `docs/kiro-notes.md` (KI-06 facts).

## Global Constraints

- **Tool names:**
  - Exactly `list_criteria`, `summon_ghosts`, `get_run_status`, `get_haunting_report` and `rehaunt`.
  - They must match `^[a-zA-Z][a-zA-Z0-9_]*$`, and every tool needs a non-empty description (Kiro).
- **Output size:**
  - Every tool result's text is ≤ **6000** chars (≈ < 2k tokens, PRD F11).
  - Haunted id lists are capped at **20**, then `+N more`.
  - Criterion text in `list_criteria` is clipped to **200** chars.
  - No artifacts, frames, plans or screenshots ever go into a result (Req 10.2).
- **`waitMs`:**
  - Default **50 000**, max **100 000**, min 0.
  - The server's per-call budget stays below Kiro's 120 s default.
- **One active run per server process.** A second start returns `isError` naming the active `runId`.
- **Path confinement:** a `specDir` or `configPath` that resolves outside root is rejected with `isError`.
- **stdout carries only the MCP protocol.** Warnings and logs go to stderr.
- **Chromium** is launched only by core's `summon()` (guarded, D-18, D-22). The MCP package never launches a browser itself.
- **Never edit** the user's `requirements.md`, `design.md` or `tasks.md` (D-14). The MCP server writes nothing of its own; `summon()` writes the report and the run folder.
- **No writes into `fixtures/candy-swap/`** (D-37). The Kiro wiring template goes in `integrations/kiro/`.
- **Pin exact versions.** The only new dependency is `@modelcontextprotocol/sdk` `1.32.2`.
- **Escapes:** keep invisible and bidi characters as `\uXXXX` escapes in source.
- **Checks and commits:** run `npm run health` at the end of every task. Commit messages are `F11: <what>`.

## Review Focus

1. **The agent polls a `runId` that never existed or belongs to a past process:** it expects an `isError` saying it's unknown and telling it to call `summon_ghosts`, not a hang or a crash. Test in Task 3.
2. **A run that fails in the background** (bad config target, missing API key, or `CompilerError`): `get_run_status` must return `status: 'failed'` with the message, and the next `summon_ghosts` must be allowed. Test in Task 3.
3. **`specDir: "../../etc"` or an absolute path outside root:** expects `isError`, and nothing read or written. Test in Task 1.
4. **`get_haunting_report` before any run, or for a criterion that's clean or was trimmed from the markdown:** expects a helpful error, or a short summary built from the JSON. Test in Task 2.
5. **A huge spec** (hundreds of criteria) or a report with a giant section: every result is still ≤ 6000 chars and ends with a truncation note. Test in Task 2 (`capText`) and Task 4 (`list_criteria` on 300 criteria).

---

### Task 1: Package scaffold, path rules and result formatting

**Files:**
- Create: `packages/mcp/package.json`, `packages/mcp/src/paths.ts`, `packages/mcp/src/format.ts`, `packages/mcp/src/index.ts`
- Test: `packages/mcp/test/paths.test.ts`, `packages/mcp/test/format.test.ts`
- Modify: `docs/STACK.md` (pin `@modelcontextprotocol/sdk` 1.32.2 in the versions table)

**Interfaces:**
- Produces:
  - `class PathError extends Error`
  - `resolveInside(root: string, p: string): string`: an absolute path. Throws `PathError` if the result isn't `root` itself or inside it (compare with `path.relative`; reject `..` prefixes and absolute results).
  - `findConfig(specDir: string, root: string): string | undefined`: walks up from `specDir` to `root` inclusive and returns the first `poltergeist.config.json` that exists.
  - `MAX_TEXT = 6000`, `MAX_IDS = 20`
  - `capText(s: string, max = MAX_TEXT): string`: if it's over `max`, cut it and append `\n… truncated (N more chars)`. The whole result stays ≤ `max`.
  - `capIds(ids: readonly string[], max = MAX_IDS): string[]`: the first `max` ids, plus `+N more` when there are more.
  - `RunSummary = { runId; status: 'running' | 'finished' | 'failed'; counts?: Record<CriterionVerdict | 'notRun', number>; haunted?: string[]; flaky?: string[]; reportPath?: string; progress?: { pairsDone: number; pairsTotal: number; phase: string }; error?: string; hint?: string }`
  - `summarize(result: SummonResult, cwdForPaths: string): RunSummary`: counts per criterion verdict (selected criteria not in `verdicts.criteria` count as `notRun`), haunted and flaky ids capped, `reportPath` relative to `cwdForPaths`, and a `hint` (`"Read get_haunting_report with criterion <first haunted id>"` when anything is haunted).

- [ ] **Step 1: Create `packages/mcp/package.json`.** Name `@poltergeist/mcp`, private, ESM, engines node ≥ 22, `bin: { "poltergeist-mcp": "./bin/poltergeist-mcp.js" }`, `exports: { ".": "./src/index.ts" }`. Deps: `@poltergeist/core: "*"`, `@modelcontextprotocol/sdk: "1.32.2"`, `playwright-core: "1.64.1"`, `tsx: "4.23.15"`, `zod: "4.6.7"`. Run `npm install`. Expected: the lockfile updates and nothing else.
- [ ] **Step 2: Write the failing tests.**
  - `resolveInside('/w', 'specs/a')` → `'/w/specs/a'`.
  - `resolveInside('/w', '/w')` → `'/w'`.
  - `resolveInside('/w', '../etc')`, `resolveInside('/w', '/etc')` and `resolveInside('/w', 'a/../../x')` throw `PathError`.
  - `findConfig` finds the config in the parent of `specDir`, prefers the nearest one, and returns `undefined` when none exists up to root (temp dirs).
  - `capText('x'.repeat(7000)).length <= 6000` and ends with `truncated (`.
  - `capIds` on 25 ids → 20 ids plus `'+5 more'`.
  - `summarize` on a hand-built `SummonResult` (two criteria, one haunted) gives `status: 'finished'`, `haunted: ['3.2']`, `counts.haunted === 1`, a relative `reportPath`, and a hint containing `3.2`.
- [ ] **Step 3: Run them.** `npx vitest run packages/mcp/test/paths.test.ts packages/mcp/test/format.test.ts`. Expected: FAIL (modules missing).
- [ ] **Step 4: Implement** `paths.ts` and `format.ts` as specified. `index.ts` re-exports them.
- [ ] **Step 5: Run the tests again**, expecting PASS, then `npm run health`.
- [ ] **Step 6: Commit** `F11: mcp package, path confinement and result caps`.

### Task 2: Report reader

**Files:**
- Create: `packages/mcp/src/report.ts`
- Test: `packages/mcp/test/report.test.ts`

**Interfaces:**
- Consumes: `capText` (Task 1), `ReportJsonSchema` / `ReportJson` (core).
- Produces:
  - `class NoReportError extends Error` (its message says to call `summon_ghosts` first).
  - `readReport(specDir: string, criterion?: string): Promise<string>`:
    - It reads `haunting-report.md` (required, else `NoReportError`) and `haunting-report.json` (optional, parsed with `ReportJsonSchema`).
    - **Without `criterion`:** everything before `## Haunted` (the header, counts and `## Board`) plus a closing line: `Ask for one criterion with get_haunting_report { criterion }.`
    - **With `criterion`:** the markdown section whose heading matches `/^### \S+ <escaped id> — /m`, through to the next `^### ` or `^## `.
    - **Fallback** when that section is missing and the JSON has the criterion: `### <id> — <verdict>`, then `<text>`, then one line per pair: `- <persona>: <verdict> — <reason>` plus its first `failing[0].lastDetail` if there is one.
    - An unknown criterion throws `RangeError` listing the known ids (capped by `capIds`).
    - Always returns `capText(...)`.

- [ ] **Step 1: Write the failing tests.**
  - Write a report with core's `renderReport` and `writeReport` from a small hand-built `Verdicts` (reuse the inputs of `packages/core/test/report/` tests where possible): 3.2 haunted, 3.1 clean.
  - No criterion → contains `## Board` and not `## Haunted`.
  - `'3.2'` → starts with `### [!!] 3.2 — `, and contains no `### ` heading for any other id.
  - `'3.1'` (clean, so no markdown section) → JSON fallback containing `3.1 — clean`.
  - `'9.9'` → `RangeError`.
  - Empty dir → `NoReportError`.
  - A report whose 3.2 section is 10 000 chars → result ≤ 6000 chars.
- [ ] **Step 2: Run** `npx vitest run packages/mcp/test/report.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `report.ts`.** Escape the id for the regex (ids like `3b.1` contain `.`).
- [ ] **Step 4: Run** the tests and `npm run health`. Expected: PASS.
- [ ] **Step 5: Commit** `F11: report reader (board, per-criterion section, JSON fallback)`.

### Task 3: RunManager (one background run, long-poll)

**Files:**
- Create: `packages/mcp/src/runs.ts`
- Test: `packages/mcp/test/runs.test.ts`

**Interfaces:**
- Consumes: `summon`, `newRunId`, `SummonOptions`, `SummonEvent` (core), `summarize` and `RunSummary` (Task 1).
- Produces:
  - `type SummonFn = (opts: SummonOptions) => Promise<SummonResult>`
  - `class RunBusyError extends Error { activeRunId: string }`
  - `class UnknownRunError extends Error`
  - `class RunManager`:
    - `constructor(opts: { summon?: SummonFn; root: string; log?: (msg: string) => void })`
    - `start(opts: Omit<SummonOptions, 'runId' | 'signal' | 'onEvent' | 'onWarning'>): string`:
      - throws `RunBusyError` if a run is active;
      - otherwise picks `newRunId()`, creates an `AbortController`, and calls `summon` with `runId`, `signal`, `onWarning: log`, and an `onEvent` that tracks progress;
      - returns `runId` synchronously.
    - `wait(runId: string, waitMs: number): Promise<RunSummary>`:
      - resolves as soon as the run settles, or after `waitMs` with `status: 'running'` and `progress`;
      - throws `UnknownRunError` for ids it never started.
    - `abortAll(): Promise<void>`: aborts the active run and waits for it to settle (it never rejects).
  - Progress, from events:
    - `pairsTotal`: `criteria.length × personas.length × reps` from `run.started`;
    - `pairsDone`: counts `verdict.pair` events;
    - `phase`: the last event family seen (`scout`, `compile`, `run` or `verdicts`). Look at `RunEvent` in `packages/core/src/runner/types.ts` and map its type prefixes.
  - Finished and failed runs are kept in a `Map` (last 20) so `get_run_status` can still answer. A failure → `status: 'failed'`, `error: err.message`. Clear the active slot when the run settles.

- [ ] **Step 1: Write the failing tests** with a fake `SummonFn` (a deferred promise, plus `onEvent` calls driven by the test):
  - `start` returns an id at once.
  - `wait(id, 10)` while pending → `status: 'running'` with `progress.pairsTotal` from a `run.started` event.
  - A second `start` → `RunBusyError` with `activeRunId`.
  - Resolve the deferred → `wait` → `status: 'finished'` with haunted ids, and a new `start` is allowed.
  - A rejected run → `status: 'failed'`, `error` contains the message, and the next `start` is allowed.
  - `wait('nope', 0)` → `UnknownRunError`.
  - `abortAll()` aborts the signal the fake received.
- [ ] **Step 2: Run** `npx vitest run packages/mcp/test/runs.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `runs.ts`.** `wait` races the run's settled promise against `setTimeout(waitMs)` and clears the timer.
- [ ] **Step 4: Run** the tests and `npm run health`. Expected: PASS.
- [ ] **Step 5: Commit** `F11: run manager with long-poll and one active run`.

### Task 4: MCP server and tools

**Files:**
- Create: `packages/mcp/src/server.ts`
- Modify: `packages/mcp/src/index.ts` (export `createServer`)
- Test: `packages/mcp/test/server.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3, plus core's `parseSpec`, `UsageError`, `ConfigError`, `SpecNotFoundError`, `CompilerError`, `RunnerSafetyError`, `PERSONA_IDS`.
- Produces:
  - `type ServerDeps = { root: string; summonOverrides?: Pick<SummonOptions, 'llm' | 'launch' | 'runOptions'>; env?: NodeJS.ProcessEnv; log?: (msg: string) => void; summon?: SummonFn }`
  - `createServer(deps: ServerDeps): { server: McpServer; runs: RunManager }`. The server is named `poltergeist` with version `0.0.0`.
  - **Tools** (input zod shapes; every handler returns `{ content: [{ type: 'text', text }], structuredContent? }`, with `text = capText(JSON.stringify(obj))` for JSON results):

| Tool | Input | Result |
|---|---|---|
| `list_criteria` | `{ specDir: string }` | `{ criteria: [{ id, text (≤200), kind }], total }`. If the JSON exceeds 6000 chars, drop trailing criteria and add `truncated: N` |
| `summon_ghosts` | `{ specDir, configPath?, personas?: string[], reps?: int 1–10, recompile?: boolean, waitMs?: int 0–100000 }` | `RunSummary` |
| `get_run_status` | `{ runId: string, waitMs? }` | `RunSummary` |
| `get_haunting_report` | `{ specDir, criterion?: string }` | markdown text |
| `rehaunt` | `{ specDir, ids: string[] (min 1), configPath?, personas?, reps?, waitMs? }` | `RunSummary` (`summon` with `only: ids`; no diff, that's F14) |

  - **Descriptions:** plain QA wording, saying what the tool does and when to call it next. For example, `summon_ghosts`: "Runs adversarial browser tests for every acceptance criterion in a Kiro spec against the running app. Returns counts and failing criterion ids; if status is running, call get_run_status with the runId."
  - **Shared path handling:**
    - `specDir = resolveInside(root, input.specDir)`;
    - `configPath = input.configPath ? resolveInside(root, input.configPath) : findConfig(specDir, root)`;
    - `cwd: root`, `env: deps.env`, plus `summonOverrides`.
  - **Usage errors before starting:**
    - an unknown persona id is checked against `PERSONA_IDS`;
    - unknown criterion ids for `rehaunt` are checked by `parseSpec(specDir)` before `start`, so the agent gets an immediate `isError`.
  - **Error mapping:** a `PathError`, `RunBusyError`, `UnknownRunError`, `NoReportError`, `RangeError` or any of the core errors above → `{ isError: true, content: [{ type: 'text', text: '<ErrorName>: <message>' }] }`. Never throw out of a handler.
  - **Logs:** every log goes through `deps.log`, which defaults to a stderr write.

- [ ] **Step 1: Write the failing tests.** Connect an SDK `Client` to `createServer` through `InMemoryTransport.createLinkedPair()`, with a fake `summon`.
  - `listTools` returns exactly the five names, each matching `^[a-zA-Z][a-zA-Z0-9_]*$` with a non-empty description.
  - `list_criteria` on a temp spec with 300 generated criteria → text ≤ 6000 and `truncated > 0`.
  - `list_criteria` with `specDir: '../outside'` → `isError`, and the text starts with `PathError`.
  - `summon_ghosts` with `personas: ['ghost']` → `isError`, and fake summon is never called.
  - `summon_ghosts` with `waitMs: 0` on a pending fake → `status: 'running'`; then `get_run_status` → `finished` once the fake resolves.
  - `rehaunt` with `ids: ['9.9']` → `isError` naming `9.9`.
  - `summon_ghosts` with `configPath` omitted passes the config found by `findConfig` to fake summon.
- [ ] **Step 2: Run** `npx vitest run packages/mcp/test/server.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `server.ts`** with `McpServer.registerTool(name, { description, inputSchema }, handler)`.
- [ ] **Step 4: Run** the tests and `npm run health`. Expected: PASS.
- [ ] **Step 5: Commit** `F11: MCP server with five tools`.

### Task 5: stdio entry, bin, Done-when (fixture) and Kiro wiring

**Files:**
- Create:
  - `packages/mcp/src/main.ts`, `packages/mcp/bin/poltergeist-mcp.js`
  - `integrations/kiro/mcp.json`
  - `docs/kiro-notes.md`
- Test: `packages/mcp/test/done-when.test.ts`, `packages/mcp/test/bin.test.ts`

**Interfaces:**
- Consumes: `createServer` (Task 4), `makeClaimsProject` (`packages/core/test/summon/project-fixture.ts`).
- Produces:
  - `parseMcpArgs(argv): { root: string }`: `--root <dir>`, default `process.cwd()`, resolved to an absolute path; `--help` prints usage. Anything unknown throws.
  - `runStdio(argv: readonly string[]): Promise<void>`:
    - connects `StdioServerTransport`;
    - on `SIGTERM`, `SIGINT` or transport close, calls `runs.abortAll()` and then `server.close()`.
  - The bin mirrors `packages/cli/bin/poltergeist.js`: tsx `register()`, then `runStdio(process.argv.slice(2))`.

- [ ] **Step 1: Write the Done-when test** (fixture). Use `makeClaimsProject()` with `createServer({ root: project.root, env: project.env, summonOverrides: { llm: project.llm().client, runOptions: { frameFps: 0 } } })` over `InMemoryTransport`.
  1. `list_criteria { specDir: '.kiro/specs/claims' }` → ids `['3.1','3.2']`.
  2. `summon_ghosts { specDir, personas: ['wraith','doppelganger'], waitMs: 100000 }` → `finished`, `haunted: ['3.2']`.
  3. `get_haunting_report { specDir, criterion: '3.2' }` → contains `3.2` and `doppelganger`.
  4. `rehaunt { specDir, ids: ['3.1'], personas: ['wraith'], reps: 1, waitMs: 100000 }` → `finished`, `haunted: []`.
  5. Every response text is ≤ 6000 chars, and none contains `.png`, `.jpg` or `.zip`.

  Use a 120 s test timeout.
- [ ] **Step 2: Write the bin test.** Spawn the real bin through the SDK's `StdioClientTransport` (`command: process.execPath`, `args: [binPath, '--root', tmp]`), then check that `listTools` returns the five names and that `close()` exits the child cleanly. A second case: `--bogus` exits non-zero and prints the usage line to stderr.
- [ ] **Step 3: Run** `npx vitest run packages/mcp/test/done-when.test.ts packages/mcp/test/bin.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement `main.ts` and the bin.** `chmod +x` the bin.
- [ ] **Step 5: Run** the tests and `npm run health`. Expected: PASS.
- [ ] **Step 6: Write the Kiro wiring.**
  - `integrations/kiro/mcp.json`:
    - `{ "mcpServers": { "poltergeist": { "command": "npx", "args": ["poltergeist-mcp", "--root", "."], "env": { "ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY}" }, "autoApprove": ["list_criteria", "get_run_status", "get_haunting_report"] } } }`;
    - a sibling `integrations/kiro/README.md` explains it in five lines (F13 installs it; this is the manual path).
  - `docs/kiro-notes.md`:
    - the researched facts with their URLs: MCP config paths, merge order, fields, `${VAR}` interpolation, `timeout` and `requestTimeout` (unverified for IDE `mcp.json`), the tool-name regex and 64-char limit, transports, prompts and resources;
    - the hook and Power formats, marked **unverified**;
    - the manual F11 check steps in Kiro.
- [ ] **Step 7: Commit** `F11: stdio bin, fixture Done-when, Kiro MCP template and kiro-notes`.

### Task 6: Close the cycle (docs)

**Files:**
- Modify: `docs/DECISIONS.md` (D-38), `docs/KNOWN_ISSUES.md` (KI-06, KI-12 and new KIs), `.kiro/specs/poltergeist/design.md` §10, `.kiro/specs/poltergeist/tasks.md`, `docs/PRD.md` (F11 status and changelog), `AGENTS.md` (current state).

- [ ] **Step 1: Write D-38**, the F11 rulings from the grill (Q1–Q14).
- [ ] **Step 2: Update the KIs.**
  - KI-12 → Resolved (long-poll).
  - KI-06 → Investigating (MCP facts confirmed in kiro-notes; hooks, Power, IDE `requestTimeout` and `cwd` still open).
  - New KI: the F11 Done-when in a real Kiro session on Candy Swap (blocked on F10/KI-44).
  - New KI: a `rehaunt` subset run rewrites `haunting-report.md` with the others marked `notRun` (F14 should merge with the previous verdicts).
  - Update the summary tables.
- [ ] **Step 3: Update the spec and PRD.**
  - design §10 table: add `get_run_status`, long-poll and `waitMs`.
  - Requirement 10.1: add `get_run_status` to the tool list.
  - PRD F11 → Done (fixture), plus a changelog line.
  - Tick `tasks.md`.
- [ ] **Step 4: Update `AGENTS.md`** current state and next steps.
- [ ] **Step 5: Run `npm run health`**, expecting green, then commit `F11: close cycle (D-38, KI-06/12, design §10, PRD, AGENTS)`.
