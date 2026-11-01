# F07 Verdicts + F08 Haunting Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn F06's raw per-rep results into reproducible pair and criterion verdicts (F07), then write a fix-ready `haunting-report.md` + `haunting-report.json` into the spec folder (F08).

**Architecture:** Two new pure modules in `@poltergeist/core`: `src/verdicts/` (`decideVerdicts`, which has no I/O) and `src/report/`, which holds the pure `renderReport` → `{markdown, json}`, plus `writeReport`, the only function that touches disk. It writes exactly two files atomically. A fixture-first Done-when test runs the real claims fixture race through runner → verdicts → report.

**Tech Stack:** TypeScript (ESM, Node ≥ 22), zod 4, vitest 4, node:fs/promises, node:path (posix), playwright-core (Done-when test only).

**Spec:** `.kiro/specs/poltergeist/requirements.md` Requirements 7 and 8; `docs/DECISIONS.md` **D-34** and **D-35** (the grilled rulings, read them first), D-06, D-14, D-33; `docs/THEME.md` §4 (wordmark, verdict glyphs) and §5 (report surface); `docs/PRD.md` § F07, § F08.

## Global Constraints

- Threshold = `Math.ceil(2 * reps / 3)` (Req 7.1, D-06). Only `failure: 'app'` assertion results in reps with `outcome: 'completed'` count (D-34).
- Rollup precedence `haunted` > `flaky` > `inconclusive` > `clean`; `uncompilable` ranks as `inconclusive`; `notApplicable` ignored; no pairs / all-NA → `notApplicable` (Req 7.4, D-34).
- Glyphs (THEME §4): `haunted [!!]`, `flaky [~~]`, `inconclusive [??]`, `clean [ok]`, `notApplicable [--]`, not run `[  ]`. `uncompilable` shows `[??]`.
- File names are exactly `haunting-report.md` and `haunting-report.json`. Nothing else in the spec folder is written, ever (Req 8.3, D-14).
- Markdown ≤ **300 lines** (`REPORT_MAX_LINES = 300`), hard.
- Untrusted strings: one line, ≤ 200 chars (`…` suffix when cut), code spans use a fence longer than the longest backtick run inside.
- Artifact paths relative to the spec folder, POSIX `/` separators.
- No theme prose beyond the wordmark and glyphs. `fill` steps show `generator: <id>`, never a value (D-04).
- Deterministic output: no `Date.now()`, no random. Timestamps only from input.
- `npm run health` must exit 0 after every task.

## Review Focus

1. **A rep list shorter than `reps`** (run aborted mid-way, or pair absent from results): must not be `clean`. Expect `inconclusive` with reason `not run` / `ran k of N reps`. Pinned in Task 1.
2. **Criterion text containing backticks, pipes or newlines** (e.g. ``Use `code` | here``): the markdown must not break structure. Pinned in Task 3.
3. **A spec with 40 haunted criteria**: the report must stay ≤ 300 lines and say the JSON has the rest. Pinned in Task 3.
4. **Artifacts on another drive / runDir outside the spec folder**: paths stay relative (`../../.poltergeist/...`) with `/`. Pinned in Task 3.
5. **A stale `haunting-report.md` from an older run, or a `.tmp` leftover**: overwritten whole; no other file touched. Pinned in Task 4.

---

## File Structure

```
packages/core/src/verdicts/
  types.ts     PairVerdict, CriterionVerdict, PairVerdictRecord, CriterionVerdictRecord, Verdicts
  decide.ts    decideVerdicts, verdictThreshold
  index.ts
packages/core/src/report/
  glyphs.ts    VERDICT_GLYPHS, DRAFT_WORDMARK (KI-40)
  schema.ts    ReportJsonSchema (zod, version 1), ReportJson
  text.ts      oneLine, codeSpan, describeStep, describeAssertion
  render.ts    renderReport, ReportInput, RenderedReport, REPORT_MAX_LINES
  write.ts     writeReport, REPORT_FILES
  index.ts
packages/core/src/index.ts       + verdicts, report re-exports
packages/core/test/verdicts/decide.test.ts
packages/core/test/report/{text,render,write}.test.ts
packages/core/test/report/done-when.test.ts
```

---

### Task 1: F07 Verdict engine

**Files:**
- Create: `packages/core/src/verdicts/{types,decide,index}.ts`, `packages/core/test/verdicts/decide.test.ts`
- Modify: `packages/core/src/index.ts` (add `export * from './verdicts/index.js';`)

**Interfaces:**
- Consumes: `PairResult` (`compiler/compile.ts`), `PairRepResult`, `RepOutcome` (`runner/types.ts`), `BlockedRequest` (`safety/guard.ts`), `PersonaId`.
- Produces:
```ts
export type PairVerdict = 'haunted' | 'flaky' | 'inconclusive' | 'clean' | 'notApplicable' | 'uncompilable';
export type CriterionVerdict = Exclude<PairVerdict, 'uncompilable'>;
export type FailingAssertion = { index: number; type: string; failures: number; details: { rep: number; detail: string }[] };
export type PairVerdictRecord = {
  criterion: string; persona: PersonaId; verdict: PairVerdict;
  reason?: string;                 // NA/uncompilable reason, or why inconclusive
  reps: number; threshold: number; repsRun: number;
  failing: FailingAssertion[];     // app failures only, sorted by failures desc then index
  repOutcomes: { rep: number; outcome: RepOutcome; error?: string }[];
  artifacts: string[];             // union over failed reps, run-folder-relative, sorted
  blocked: BlockedRequest[];
};
export type CriterionVerdictRecord = { criterion: string; verdict: CriterionVerdict; pairs: { persona: PersonaId; verdict: PairVerdict }[] };
export type Verdicts = { pairs: PairVerdictRecord[]; criteria: CriterionVerdictRecord[] };
export function verdictThreshold(reps: number): number;  // Math.ceil(2*reps/3)
export function decideVerdicts(pairs: readonly PairResult[], results: readonly PairRepResult[], reps: number): Verdicts;
```
Output order: pairs in input order; criteria in first-appearance order of `pairs`.

- [ ] **Step 1: Write the failing table test** `decide.test.ts`. Build `PairRepResult`s with a helper `rep(n, outcome, asserts: [ok, failure?][])`. One `it.each` row per path (reps = 3, threshold 2):

| case | reps' assertions | expect |
|---|---|---|
| 3/3 same index app fail | `[[false,'app']]` ×3 | `haunted`, `failing[0].failures === 3` |
| 2/3 same index | fail, fail, pass | `haunted` |
| 2 fails on **different** indexes | `[F,T]`,`[T,F]`,`[T,T]` | `flaky` |
| 1/3 | fail, pass, pass | `flaky` |
| 1 app fail + 2 systemError | | `flaky` |
| all pass, all completed | | `clean` |
| planError ×3 | | `inconclusive`, reason contains `planError` |
| timeout + 2 pass | | `inconclusive` (KI-39) |
| `failure: 'blocked'` ×3 | | `inconclusive` |
| `failure: 'plan'` ×3 | | `inconclusive` |
| app fail inside a `timeout` rep ×3 | | `inconclusive` (only completed reps count) |
| only 2 of 3 reps present, both pass | | `inconclusive`, reason `ran 2 of 3 reps` |
| compiled pair absent from results | | `inconclusive`, reason `not run` |
| compiler `notApplicable` / `uncompilable` | | passes through with `reason` |

Also: `verdictThreshold` for 1→1, 2→2, 3→2, 4→3, 10→7; reps=1 with one app fail → `haunted`. Rollup table: `[haunted, clean]`→haunted; `[flaky, inconclusive]`→flaky; `[uncompilable, clean]`→inconclusive; `[notApplicable, clean]`→clean; `[notApplicable]`→notApplicable; artifacts unioned and sorted; results for pairs not in `pairs` are ignored.

- [ ] **Step 2: Run `npx vitest run packages/core/test/verdicts`**. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `types.ts`, `decide.ts`, `index.ts` per the Interfaces. Index results by `${criterion}\u0000${persona}`. Inconclusive reasons: `not run`, `ran k of N reps`, or the distinct non-completed outcomes / non-app failure kinds joined, e.g. `planError: <first error>`.
- [ ] **Step 4: Run the test, then `npm run health`**. Expected: PASS, exit 0.
- [ ] **Step 5: Commit** `F07: verdict engine (decideVerdicts, threshold, roll-up)`.

---

### Task 2: Report text helpers, glyphs, JSON schema

**Files:**
- Create: `packages/core/src/report/{glyphs,schema,text}.ts`, `packages/core/test/report/text.test.ts`

**Interfaces:**
- Consumes: `Step`, `Assertion`, `PlanTarget` (`compiler/dsl.ts`); Task 1 types.
- Produces:
```ts
export const VERDICT_GLYPHS: Readonly<Record<PairVerdict | 'notRun', string>>; // uncompilable '[??]', notRun '[  ]'
export const DRAFT_WORDMARK: string;              // THEME §4, 3 rows + tagline, exact copy
export function oneLine(s: string, max = 200): string;   // collapse \s+ (incl. \r\n,  ) to ' ', trim, cut to max with '…'
export function codeSpan(s: string): string;      // oneLine, then fence = '`'.repeat(longestRun+1), pad with spaces if s starts/ends with '`'
export function describeTarget(t: PlanTarget): string;   // `button "Claim"` | `field labelled "Email"` | `text "Hi"` | `test id "x"`
export function describeStep(s: Step): string;    // e.g. `click button "Claim Sour Skulls"`, `fill field labelled "Name" with generator: naughty`, `wait 500 ms`, `barrier "fire" (both actors meet)`, `hold POST /api/claims`
export function describeAssertion(a: Assertion): string; // e.g. `GET /api/candies/sour-skulls $.claims.length equals 1`, `no console errors`
export const ReportJsonSchema: z.ZodType;          // see below
export type ReportJson = z.infer<typeof ReportJsonSchema>;
```
JSON shape (version 1):
```ts
{ version: 1, runId, target, model, reps, startedAt /* ISO from input */, specFile: 'requirements.md',
  counts: Record<CriterionVerdict | 'notRun', number>,
  criteria: [{ id, requirement, text, line, verdict: CriterionVerdict | 'notRun',
    pairs: [{ persona, verdict, reason?, intent?, threshold, repsRun, reps,
      steps?: { a: string[]; b?: string[] }, expected: string[], failing: FailingAssertion[],
      repOutcomes, artifacts /* spec-folder-relative */, blocked: { method, url, reason }[] }] }] }
```

- [ ] **Step 1: Write failing tests** in `text.test.ts`: `oneLine('a\n\n b c')` → `'a b c'`; a 250-char string → length 200 ending `…`; `codeSpan('x`y')` → ``'``x`y``'``; `codeSpan('`a')` → ``'`` `a ``'``; `describeStep` for one step of each type in design §6 (table); `fill` never contains a value; `describeAssertion` for each of the 7 assertion types; `VERDICT_GLYPHS.haunted === '[!!]'` etc. for all 7; `DRAFT_WORDMARK` contains `your spec, haunted.`; `ReportJsonSchema.parse` rejects `version: 2`.
- [ ] **Step 2: Run** `npx vitest run packages/core/test/report/text.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the three files. `describeStep` uses an exhaustive switch on the step's single key.
- [ ] **Step 4: Run the test, then `npm run health`**. Expected: PASS.
- [ ] **Step 5: Commit** `F08: report glyphs, text helpers, JSON schema`.

---

### Task 3: `renderReport`

**Files:**
- Create: `packages/core/src/report/render.ts`, `packages/core/test/report/render.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2; `Criterion` (`spec/types.ts`), `PairResult`.
```ts
export const REPORT_MAX_LINES = 300;
export type RunMeta = { runId: string; runDir: string /* absolute */; target: string; reps: number; model: string; startedAt: number /* epoch ms */ };
export type ReportInput = { specDir: string /* absolute */; criteria: readonly Criterion[]; compiled: readonly PairResult[]; verdicts: Verdicts; run: RunMeta; wordmark?: string };
export type RenderedReport = { markdown: string; json: ReportJson };
export function renderReport(input: ReportInput): RenderedReport;
```

Markdown layout (exact headings):
```
# Haunting report

```text
<wordmark>
```

Run `<runId>` against `<target>` · <reps> reps · <model> · <startedAt ISO>
**<n> haunted** [!!] · <n> flaky [~~] · <n> inconclusive [??] · <n> clean [ok] · <n> n/a [--] · <n> not run [  ]

## Board

- [!!] 3.2 — <oneLine text>          (one line per spec criterion, spec order; not in verdicts → [  ])

## Haunted

### [!!] 3.2 — <oneLine text>

**Promise:** `requirements.md` line 41, Requirement 3 (<requirement title>): <codeSpan(text)>

#### doppelganger — failed 3/3 reps
**Intent:** <oneLine intent>
**Steps** (actor a / actor b):   numbered list per actor via describeStep; actor b block only if present
**Expected:** each failing assertion → `describeAssertion`
**Actual:** per failing assertion: rep k: <codeSpan(detail)>
**Artifacts:** `../../.poltergeist/runs/<id>/artifacts/...` (one per line)
**Fix:** make the app satisfy the promise above for this flow, then re-run Poltergeist on 3.2.

## Flaky
### [~~] 2.1 — <text>
- <persona> failed k/N reps: <describeAssertion of top failing> — <codeSpan(first detail)>

## Inconclusive
- [??] 4.1 <persona>: <codeSpan(reason)>
```
Relative paths: `path.relative(specDir, join(runDir, a)).split(sep).join('/')`. Cap: build sections as line arrays; if total > `REPORT_MAX_LINES`, drop inconclusive lines from the end, then flaky sections from the end, then haunted sections from the end, until it fits with the trailer `_Trimmed to 300 lines: <n> more section(s) in haunting-report.json._`. The board always stays: if the board alone overflows, it is truncated the same way with the trailer.

- [ ] **Step 1: Write failing tests** in `render.test.ts` with a hand-built 4-criterion input (one haunted doppelganger with two actors, one flaky, one inconclusive, one notApplicable, plus one spec criterion absent from verdicts):
  - `markdown` starts with `# Haunting report\n\n```text\n` and contains `your spec, haunted.`
  - board has `- [!!] 3.2 — `, `- [~~]`, `- [??]`, `- [--]`, `- [  ]` lines in spec order
  - haunted section contains `### [!!] 3.2 — `, `line 41`, `failed 3/3 reps`, `1. click button "Claim Sour Skulls"`, an actor b list, `Expected:`, `rep 1:`, and `../../.poltergeist/runs/r1/artifacts/3.2__doppelganger__rep1/screenshot-a.png` (specDir `/p/.kiro/specs/s`, runDir `/p/.poltergeist/runs/r1`)
  - flaky section line contains `failed 1/3 reps`; inconclusive line contains its reason
  - no `fill` value: a plan with `fill … generator: naughty` renders `generator: naughty`
  - **Review Focus 2:** criterion text ``Use `code` | here\nnext`` renders on one line with a valid code span
  - **Review Focus 3:** 40 haunted criteria → `markdown.split('\n').length <= 300`, contains `haunting-report.json`, and `json.criteria` still has all 40 with full pairs
  - **Review Focus 4:** runDir `/elsewhere/runs/r1` → artifact path starts with `../../../../elsewhere/` and contains no `\`
  - `wordmark: 'X'` override replaces the draft
  - deterministic: two calls give identical output; `ReportJsonSchema.parse(json)` succeeds; `json.counts.haunted === 1`
- [ ] **Step 2: Run** `npx vitest run packages/core/test/report/render.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `render.ts`.
- [ ] **Step 4: Run the test, then `npm run health`**. Expected: PASS.
- [ ] **Step 5: Commit** `F08: renderReport (board, fix-ready tasks, 300-line cap, JSON)`.

---

### Task 4: `writeReport`, exports, Done-when

**Files:**
- Create: `packages/core/src/report/{write,index}.ts`, `packages/core/test/report/{write,done-when}.test.ts`
- Modify: `packages/core/src/index.ts` (add `export * from './report/index.js';`)

**Interfaces:**
```ts
export const REPORT_FILES = Object.freeze({ markdown: 'haunting-report.md', json: 'haunting-report.json' });
export async function writeReport(specDir: string, rendered: RenderedReport): Promise<{ markdownPath: string; jsonPath: string }>;
```
Writes `<file>.<pid>.<random>.tmp`, then `rename` for each file; JSON is `JSON.stringify(json, null, 2) + '\n'`. Throws if `specDir` doesn't exist (no `mkdir`; the spec folder is the user's). On failure, unlinks its own tmp file (best-effort).

- [ ] **Step 1: Write failing tests** in `write.test.ts` (tmp dir with `requirements.md`, `design.md`, `tasks.md`):
  - after `writeReport`, dir listing is exactly the 3 spec files + the 2 report files; spec files byte-identical and mtimes unchanged (Req 8.3)
  - **Review Focus 5:** a pre-existing long `haunting-report.md` is fully replaced by a shorter one (no leftover tail); no `.tmp` remains
  - JSON file parses with `ReportJsonSchema`
  - missing `specDir` rejects and creates nothing
- [ ] **Step 2: Write `done-when.test.ts`** (PRD F08 Done-when, fixture-first, D-35). Reuse `startClaimsFixture`, `sessionState`, `loadFor`, `plan` from `test/runner/`; launch Chromium with `guardLaunchOptions({ args: ['--host-resolver-rules=MAP *.test 127.0.0.1'] })`. Write a tmp spec folder whose `requirements.md` has Requirement 3 with criterion 3.2 "WHEN two sessions claim the same candy at once, THE System SHALL record only one claim." and 3.1 a clean criterion. `parseSpec` it; run the F06 Done-when Doppelgänger race plan for 3.2 and a passing wraith `noUncaughtExceptions` plan for 3.1 with `reps: 3, frameFps: 0, outDir: <tmp>/.poltergeist/runs/r1`; `decideVerdicts`; `renderReport`; `writeReport`. Assert: 3.2 is `haunted` (the race reproduces in ≥ 2 of 3 reps, as F06's Done-when shows); markdown contains `### [!!] 3.2 — `, `failed`, `Claim Sour Skulls`, `$.claims.length equals 1`; 3.1 board line is `[ok]`; every artifact path in the markdown exists on disk when resolved from the spec folder. When `POLTERGEIST_SAMPLE_DIR` is set, build the tmp project under that directory instead and don't delete it, so the agent check in Step 6 can open the report and its artifacts. The fixture server is stopped either way.
- [ ] **Step 3: Run** both tests. Expected: FAIL.
- [ ] **Step 4: Implement** `write.ts`, `index.ts`, the core re-export.
- [ ] **Step 5: Run** `npx vitest run packages/core/test/report`, then `npm run health`. Expected: PASS, exit 0.
- [ ] **Step 6: Agent check (Done-when, Claude Code half).** Run the Done-when test with `POLTERGEIST_SAMPLE_DIR=<scratchpad>/f08-sample` to produce the sample. Dispatch a fresh subagent given only the sample report's text, which must name the broken criterion, the route, the actions to reproduce it and the expected vs actual result. Record the outcome in KI-38 (Kiro half and Candy Swap still open).
- [ ] **Step 7: Commit** `F08: writeReport (atomic, two files only), exports, fixture Done-when`.

---

### Task 5: Close the cycle

- [ ] PRD: F07 → `Done`; F08 → `Done (fixture; Kiro + Candy Swap check pending, KI-38)`, with status-board rows, feature notes and a changelog line. Tick F07/F08 in `.kiro/specs/poltergeist/tasks.md`. Design §4: `PairVerdict` lives in `core/verdicts`; §9 notes F09 writes `verdicts.json` and calls `writeReport`. Add D-34/D-35 implementation notes if anything differed. Update the "Current state" and "Do first" sections in AGENTS.md.
- [ ] `npm run health`, exit 0. Commit `F08: close cycle (PRD, tasks, design, KIs, AGENTS)`.
