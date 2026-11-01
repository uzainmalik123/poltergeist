# F10 Candy Swap Prep Kit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Everything Poltergeist-side that F10 needs, so the team can build Candy Swap **in Kiro** (D-10, D-01) and run F10's Done-when with one command once Kiro's output lands. This plan writes **no app code**.

**Architecture:** A Kiro brief (product, stack, URL and script contract, with no hints about bugs) goes to the team to paste into Kiro. A Poltergeist config for Candy Swap sits in `fixtures/candy-swap/`. `npm run candy:check` runs F10's Done-when: Kiro's spec has the right shape and parses with no warnings, the config loads, `db:reset` takes < 1 s and is deterministic (two `db:dump` outputs are equal). The check logic is pure functions in `scripts/candy-check/check.ts`, tested against fake fixtures, and `main.ts` is a thin runner. A spec test in core is skipped until Kiro's spec exists.

**Tech Stack:** TypeScript (Node ≥ 22, ESM), tsx, vitest, `@poltergeist/core` (`parseSpec`, `loadConfig`, `runReset`).

**Spec:** grill rulings Q1–Q11 (recorded as D-37 in Task 3), PRD § F10, D-10, KI-04, KI-16.

## Global Constraints

- No Candy Swap app code, seed or spec written by us: Kiro writes `fixtures/candy-swap/**` except `poltergeist.config.json` (D-10, PRD F10 "keep Kiro's output as is").
- The brief never mentions concurrency, races, validation, double-submit, accessibility or testing, whether for or against (KI-04: nothing planted).
- URLs: `/`, `/login`, `/market`, `/inventory`, `/trades`, `/trades/new`. Port 4000. Users `ghost1`…`ghost6`.
- Scripts in `fixtures/candy-swap/package.json`: `dev` (serves :4000), `db:reset` (< 1 s, fixed seed, no randomness or wall-clock values), `db:dump` (sorted JSON of all seeded rows to stdout).
- Spec shape: 6–8 requirements, 20–30 criteria (PRD "~25"), zero F01 warnings.
- Password via `env:CANDY_SWAP_PASSWORD`; never commit real secrets.
- Candy Swap is standalone (not in root `workspaces`).

## Review Focus

1. `fixtures/candy-swap` missing entirely (today's state): `candy:check` must exit 1 with a "not built yet, see the brief" message, not a stack trace. Test: `runCandyCheck` on a missing dir.
2. `CANDY_SWAP_PASSWORD` unset: the check must still check the config (substituting a placeholder) and report a `warn`, not crash. Test in Task 2.
3. `db:reset` or `db:dump` fails (non-zero exit): this is a `fail` finding with the output tail, not a thrown error. Test with a fake fixture whose dump exits 1.
4. Dumps that differ only in whitespace or key order are equal; dumps with different rows are not. Test in Task 1.
5. A spec with warnings must list each warning code in the finding (so it can become a KI-16 note). Test in Task 1 with the `messy` fixture.

---

### Task 1: Pure check functions

**Files:**
- Create: `scripts/candy-check/check.ts`
- Test: `scripts/candy-check/check.test.ts`
- Modify: `tsconfig.json` (add `"scripts"` to `include`), `vitest.config.ts` (add `'scripts/**/*.test.ts'`)

**Interfaces:**
- Produces:
  - `type Finding = { level: 'ok' | 'warn' | 'fail'; check: string; message: string }`
  - `const SPEC_SHAPE = { requirements: [6, 8], criteria: [20, 30] } as const`
  - `const RESET_BUDGET_MS = 1000`
  - `checkSpecShape(spec: ParsedSpec): Finding[]` with checks `spec-warnings`, `spec-requirements`, `spec-criteria`. A count outside the range is `warn` (the PRD says "~25"), and any warnings are a `fail` listing the codes.
  - `checkResetTiming(durationsMs: number[]): Finding` with check `reset-time`; `fail` if any is > `RESET_BUDGET_MS`, and the message gives the max.
  - `checkDeterminism(dumps: string[]): Finding` with check `reset-deterministic`. It parses each dump as JSON and compares canonical forms (keys sorted recursively, array order kept). Invalid JSON is a `fail`.

- [ ] **Step 1: Write the failing tests**: `checkSpecShape` on the `candy-swap-draft` fixture (5 reqs, 13 criteria) gives `warn` for both counts and `ok` for warnings. On `messy`, `spec-warnings` is a `fail` whose message contains `duplicate-requirement`. A synthetic spec with 7 requirements and 25 criteria is all `ok`. `checkResetTiming([300, 999])` is `ok`, and `[300, 1001]` is a `fail` whose message contains `1001`. `checkDeterminism(['{"a":1,"b":[1,2]}', '{ "b":[1,2], "a":1 }'])` is `ok`; `['[1,2]','[2,1]']` is a `fail`; `['{', '{}']` is a `fail`.
- [ ] **Step 2: Run** `npx vitest run scripts/candy-check`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `check.ts`, plus the tsconfig and vitest include changes.
- [ ] **Step 4: Run** `npx vitest run scripts/candy-check`. Expected: PASS.
- [ ] **Step 5: Commit** `F10: candy:check pure checks (spec shape, reset time, determinism)`.

### Task 2: Runner, config, gated spec test

**Files:**
- Create: `scripts/candy-check/run.ts` (`runCandyCheck`), `scripts/candy-check/main.ts` (prints the findings and next steps, sets the exit code), `fixtures/candy-swap/poltergeist.config.json`, `.env.example`
- Test: `scripts/candy-check/run.test.ts`
- Modify: `package.json` (add `"candy:check": "tsx scripts/candy-check/main.ts"`), `packages/core/test/spec/fixtures.test.ts` (gated test)

**Interfaces:**
- Consumes: Task 1 exports; `parseSpec`, `loadConfig`, `runReset`, `ConfigError`, `ResetError` from `@poltergeist/core`.
- Produces: `runCandyCheck(opts: { fixtureDir: string; env?: NodeJS.ProcessEnv }): Promise<Finding[]>`. In order:
  1. If `<fixtureDir>/.kiro/specs/candy-swap/requirements.md` doesn't exist, return a single `fail` with check `built` and the message `Candy Swap is not built yet (KI-44): build it in Kiro from docs/plans/2026-11-01-F10-kiro-brief.md`.
  2. Run `checkSpecShape(await parseSpec(specDir))`.
  3. `loadConfig({ path: 'poltergeist.config.json', cwd: fixtureDir, env })`. If `CANDY_SWAP_PASSWORD` is unset or empty, add a `warn` (check `password-env`) and load with the placeholder `candy-check-placeholder`. A `ConfigError` is a `fail` (check `config`).
  4. Run `runReset(loaded)` twice. Each run is followed by `npm run --silent db:dump` in `fixtureDir` (use `execFile`, cwd `fixtureDir`, timeout 30 s). Then `checkResetTiming` and `checkDeterminism`. A reset or dump error is a `fail` (check `reset` or `dump`) whose message is the error message.
- `main.ts`: prints each finding as `[ok] / [??] / [!!] check: message` (the plain THEME verdict glyphs), and when nothing fails, prints the next steps (start `npm run --prefix fixtures/candy-swap dev`, then KI-30 scout, KI-34/36/42 `doppler run -- npm run summon`). Exits 1 if any finding is a `fail`, otherwise 0. `fixtureDir` defaults to `<repo>/fixtures/candy-swap`.

`fixtures/candy-swap/poltergeist.config.json`:
```json
{
  "target": "http://localhost:4000",
  "routes": [
    { "path": "/", "auth": false },
    { "path": "/login", "auth": false },
    { "path": "/market", "auth": true },
    { "path": "/inventory", "auth": true },
    { "path": "/trades", "auth": true },
    { "path": "/trades/new", "auth": true }
  ],
  "accounts": {
    "default": { "loginRoute": "/login", "username": "ghost1", "password": "env:CANDY_SWAP_PASSWORD" }
  },
  "resetCommand": "npm run --silent db:reset",
  "concurrency": 12,
  "reps": 3,
  "forbidden": []
}
```
`.env.example`: `ANTHROPIC_API_KEY=` and `CANDY_SWAP_PASSWORD=` (with a comment that the value is whatever demo password Kiro's seed uses, and that Doppler is preferred).

- [ ] **Step 1: Write the failing tests** in `run.test.ts`, using temp fake fixtures (`mkdtemp`) that hold a copy of the real config, a `.kiro/specs/candy-swap/requirements.md` (copied from the `candy-swap-draft` fixture) and a `package.json` whose `db:reset`/`db:dump` are `node -e` one-liners:
  - a missing dir gives exactly `[{level:'fail', check:'built', …}]`;
  - a healthy fake (dump prints `[{"id":1}]`) has no `fail`, and with `CANDY_SWAP_PASSWORD` unset it includes a `password-env` `warn`;
  - a fake whose dump prints `Date.now()` as JSON fails `reset-deterministic`;
  - a fake whose dump exits 1 gives a `dump` `fail` and doesn't throw;
  - **the real** `fixtures/candy-swap/poltergeist.config.json` passes `parseConfig` with `env: { CANDY_SWAP_PASSWORD: 'x' }`, with no warnings.
- [ ] **Step 2: Add the gated test** to `fixtures.test.ts`: `it.skipIf(!existsSync(CANDY_REAL))('parses the real Kiro-generated Candy Swap spec with no warnings (F10)', …)`, where `CANDY_REAL = join(repoRoot, 'fixtures/candy-swap/.kiro/specs/candy-swap')`. It asserts `warnings` equals `[]` and there are between 6 and 8 requirements.
- [ ] **Step 3: Run** `npx vitest run scripts/candy-check packages/core/test/spec`. Expected: the new run tests FAIL and the gated test is skipped.
- [ ] **Step 4: Implement** `run.ts`, `main.ts`, the config, `.env.example` and the npm script.
- [ ] **Step 5: Run** the same tests (PASS), then `npm run candy:check`. Expected: exit 1 with the `built` message.
- [ ] **Step 6: Commit** `F10: candy:check runner, Candy Swap config, gated spec test`.

### Task 3: Kiro brief and docs

**Files:**
- Create: `docs/plans/2026-11-01-F10-kiro-brief.md`
- Modify: `docs/DECISIONS.md` (D-37 + table), `docs/KNOWN_ISSUES.md` (KI-44 + table; KI-16/KI-30 notes point at `candy:check`), `docs/PRD.md` (F10 status "Prep done (D-37); Kiro build pending, KI-44" + changelog), `docs/STACK.md` (the `fixtures/*` workspace line → standalone `npm --prefix`), `AGENTS.md` (current state and do-first), `.kiro/specs/poltergeist/tasks.md` (F10 line notes the prep; stays unticked)

The **brief** must contain, as a ready-to-paste prompt: open `fixtures/candy-swap/` as the Kiro workspace; ask Kiro for a spec (requirements → design → tasks) for "Candy Swap, a small Halloween candy-trading web app". It covers: log in with a handle and password; a market listing candy with quantities that can be claimed; your inventory; proposing a trade (your candy for another user's) and accepting or declining incoming trades. Stack: Hono with server-side JSX, better-sqlite3, minimal client JS, port 4000. The URLs and scripts from Global Constraints. Seed users `ghost1`…`ghost6`, all with one demo password, which goes in `.env.example`. Keep `poltergeist.config.json` untouched. Aim for 6–8 requirements and ~25 EARS criteria. **No** wording from the forbidden list in Global Constraints. After the prompt, a short checklist for the human: commit Kiro's output as is, including `.kiro/`, then run `npm --prefix fixtures/candy-swap install` and `npm run candy:check`, and log any F01 warnings to KI-16.

- [ ] **Step 1:** Write the brief. Run `grep -niE 'race|concurren|double|valid|a11y|accessib|test' docs/plans/2026-11-01-F10-kiro-brief.md` over the prompt section. Expected: no hits inside the prompt block.
- [ ] **Step 2:** Docs updates as listed.
- [ ] **Step 3:** Run `npm run health`. Expected: exit 0.
- [ ] **Step 4: Commit** `F10: Kiro brief, D-37, KI-44, PRD/STACK/AGENTS`.
