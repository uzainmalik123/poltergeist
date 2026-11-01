# Poltergeist: Product Requirements (PRD)

> Last updated: 2026-10-31 · Owner: team · Target: Kiroween 2026, **Costume Contest** (D-23)
> Spec: [`.kiro/specs/poltergeist/`](../.kiro/specs/poltergeist/requirements.md) · Theme: [THEME.md](THEME.md) · Stack: [STACK.md](STACK.md) · Decisions: [DECISIONS.md](DECISIONS.md) · Issues: [KNOWN_ISSUES.md](KNOWN_ISSUES.md) · Prototype lessons: [LESSONS.md](LESSONS.md)

## How to use this doc

- **Status:** `TBD` (not done yet) · `Done` (built _and_ its "Done when" checks pass) · `Scrapped` (deliberately not built; the reason is kept).
- **Priority:** `High` = without it there is no working product, no demo or no costume. `Med` = makes it competitive. `Low` = only if time allows.
- **Order of work:** follow the **Build order** column, not the IDs. It finishes every High feature before any Med. IDs are kept stable from the prototype so that decisions (`D-xx`) and issues (`KI-xx`) still point at the right feature.
- **Scopes don't overlap.** Each feature has an **Owns** line. Anything not listed there belongs to the feature named under **Not this feature**. If you find yourself building something another feature owns, stop and move the work there.
- **Rebuilt, not copied.** F01–F03 were built once in the prototype (`../../../poltergeist-old`, before the hacking window). Here they're rebuilt from these docs, not ported (D-25). Each of those features lists its **Prototype lessons**.
- When a feature's status changes, update the table **and** the feature section, and add a line to the changelog at the bottom.

## Status board

| Build order | ID | Feature | Priority | Status | Depends on |
|---|---|---|---|---|---|
| 0 | n/a | Scaffold: monorepo, health gate, CI (D-19) | High | Done | n/a |
| 1 | F01 | Spec Reader | High | Done | 0 |
| 2 | F02 | Target Config & Safety Allowlist | High | Done | 0 |
| 3 | F10 | Candy Swap Demo Target (built in Kiro) | High | Prep done (D-37); Kiro build pending (KI-44) | F01 (to check its spec) |
| 4 | F03 | Route Scout | High | Done (fixture; real Candy Swap check pending, KI-30) | F02, F10 |
| 5 | F04 | Core Personas & Input Generators | High | Done | n/a |
| 6 | n/a | **KI-01 spike** (compile + run 5 criteria × 3 personas) | High | TBD | F01, F03, F04 |
| 7 | F05 | Ghost Compiler (LLM → Plan DSL) | High | Done (fixture; live check pending, KI-34) | F01, F03, F04 (built before the spike, D-32) |
| 8 | F06 | Ghost Runner | High | Done (fixture; real Candy Swap check pending, KI-36) | F02, F05 (built before F10, D-33) |
| 9 | F07 | Verdicts & Flake Filter | High | Done | F06 |
| 10 | F08 | Haunting Report | High | Done (fixture; Kiro + Candy Swap check pending, KI-38) | F07 |
| 11 | F26 | Costume Kit (glyph renderer, sprites, wordmark, palette, possession) | High | TBD | n/a (can run in parallel from week 2) |
| 12 | F09 | CLI `summon` | High | Done (fixture; real Candy Swap check pending, KI-42) | F08, F26 |
| 13 | F11 | Kiro MCP Server | High | TBD | F09 |
| 14 | F12 | Séance Room (Live) | High | TBD | F06, F26 |
| 15 | F14 | Re-haunt & Verdict Diff | Med | TBD | F09 |
| 16 | F15 | Replay Mode & Deployed Séance | Med | TBD | F12 |
| 17 | F13 | Kiro Installer (`init`) + Agent Hook | Med | TBD | F11 |
| 18 | F16 | Extended Personas: Lich & Revenant | Med | TBD | F04 |
| 19 | F17 | Steering-driven House Rules | Med | TBD | F13 |
| 20 | F18 | Kiro Power Packaging | Med | TBD | F11, F17 |
| 21 | F22 | Séance Atmosphere Polish (sound, trails, idle motion) | Low | TBD | F12 |
| 22 | F19 | Amazon Bedrock Provider | Low | TBD | F05 |
| 23 | F20 | Changeling Persona (keyboard-only) | Low | TBD | F04 |
| 24 | F21 | Hosted Live Sandbox | Low | TBD | F15 |
| n/a | F23 | LLM writes free-form Playwright code | n/a | Scrapped | n/a |
| n/a | F24 | Live LLM browser agent (computer-use) | n/a | Scrapped | n/a |
| n/a | F25 | Security exploit payload generation | n/a | Scrapped | n/a |

**Minimum demo-able product:** build orders 0–14. That's the core loop *and* the costume.

**Time budget.** The window is 31 Oct to 4 Dec, 2pm PT. The deadline is still unconfirmed (KI-05).

| Week | Goal |
|---|---|
| 1 (Oct 31 – Nov 6) | Scaffold, F01, F02, F10 in Kiro, F03. The prototype built F01–F03 in a day, so this should be quick |
| 2 (Nov 7 – 13) | F04, **KI-01 spike**, F05. Start F26 in parallel (sprites and renderer) |
| 3 (Nov 14 – 20) | F06, F07, F08, F26 finished |
| 4 (Nov 21 – 27) | F09, F11, F12. **Core loop and costume work.** Then F14, F15 |
| 5 (Nov 28 – Dec 4) | F13 and others if time allows. **Freeze features on Dec 1.** Record the video, write-up, blog post, submit |

---

## HIGH

### Scaffold (build order 0) · High · Done

> 2026-10-31: done. Built with F01 (PR #1). `npm run health` is green locally and on GitHub Actions.

**Owns:** root `package.json` (npm workspaces, Node ≥ 22, ESM), `tsconfig.base.json`, ESLint flat config, Vitest config, `npm run health` (typecheck + lint + test), `.github/workflows/ci.yml`, and an empty `packages/core`.
**Not this feature:** any product code.

- **User story:** As the team, we want one command that says whether the repo is healthy, run identically locally and in CI, from the first commit.
- **Constraints:**
  - Versions pinned exactly (see STACK.md).
  - CI installs Chromium with `npx playwright-core install --with-deps chromium` once browser tests exist.
  - No secrets in CI.
- **Done when:** `npm run health` passes locally and on GitHub Actions for a trivial test.

### F01: Spec Reader · High · Done

> 2026-10-31: done. Plan `docs/plans/2026-10-31-F01-spec-reader.md`, rulings in D-27. All four Done-when fixtures pass, IDs are stable across re-parses, and 200 criteria parse in < 200 ms. Deferred review minors are in KI-16.

**Owns:** reading `requirements.md` and producing `Criterion[]` (IDs, EARS clauses, hashes, warnings). Implements Requirement 1.
**Not this feature:** choosing which criteria to run (F09 `--only`) · writing reports (F08).

- **User story:** As a developer with a Kiro spec, I want Poltergeist to understand my acceptance criteria exactly as written, so I don't have to restate my requirements anywhere else.
- **User flow:**
  1. The user passes `--spec .kiro/specs/candy-swap`.
  2. The reader walks the markdown: `Requirement N` headings, then each one's first ordered list.
  3. Each criterion is classified by EARS keywords (event / state / unwanted / optional / ubiquitous) or as `freeform`.
  4. It returns `{criteria, warnings}` with `N.M` IDs and content hashes.
- **Constraints:**
  - Rules are fixed by D-16.
  - Read-only.
  - Content never throws; only a missing file does (`SpecNotFoundError`).
  - Parsing 200 criteria takes < 200 ms.
- **Prototype lessons:** [LESSONS.md § F01](LESSONS.md#f01-spec-reader).
- **Done when:** tests pass on four fixtures:
  - this repo's own `.kiro/specs/poltergeist/requirements.md`
  - a Candy Swap draft (replaced by the real one in F10)
  - the Reanimator spec, as an external real-world sample (copy it in as a fixture with attribution)
  - a deliberately messy spec

  IDs stay the same across re-parses.

### F02: Target Config & Safety Allowlist · High · Done

> 2026-10-31: done. Plan `docs/plans/2026-10-31-F02-config-safety.md`, rulings in D-29. Every Done-when check passes against real headless Chromium, and the guard and config tests pass 5 of 5 pinned to one CPU (`npm run test:guard:1cpu`). KI-19, KI-20 and KI-21 are resolved. The review's minors are in KI-29.

**Owns:** the `poltergeist.config.json` schema and loader, secrets and redaction, the host allowlist, the network guard (dead-proxy backstop, WebRTC block, `forbidden` rules), the concurrency limiter and the reset command executor. Implements Requirement 2.
**Not this feature:** house rules from steering (F17) · executing steps and deciding what a block means for a verdict (F06).

- **User story:** As a developer, I want Poltergeist to touch only the app I point it at, with the number of ghosts limited, so I can never aim it at someone else's site or flood my own server.
- **User flow:**
  1. On `summon`, the config is validated (strict zod) and errors are shown with field paths.
  2. A non-allowlisted target is refused (exit 2).
  3. During the run, every request, redirect hop, WebSocket and WebRTC attempt outside the allowlist is blocked and reported with a reason.
- **Constraints:**
  - Design fixed by D-17, D-18 and D-22. Build the dead-proxy design **from the start**; the prototype only found it after `route.fetch` leaked.
  - Time-box the hardening. The prototype spent a lot of time here, and the remaining minors are in KI-17 to KI-21.
- **Prototype lessons:** [LESSONS.md § F02](LESSONS.md#f02-target-config--safety).
- **Done when:** tests against real headless Chromium prove each of these:
  - a run against `https://example.com` is refused;
  - a third-party fetch, a redirect hop (including one to `169.254.169.254`) and a WebSocket are blocked and reported;
  - concurrency 25 is rejected;
  - the guard tests pass 5 of 5 times pinned to one CPU (`taskset -c 0`; LESSONS § KI-23).

### F10: Candy Swap Demo Target · High · Prep done; Kiro build pending

> 2026-11-01: prep kit only, because Kiro builds the app itself (D-37). Plan `docs/plans/2026-11-01-F10-candy-swap-prep.md`. Kiro brief `docs/plans/2026-11-01-F10-kiro-brief.md`, `fixtures/candy-swap/poltergeist.config.json`, and `npm run candy:check`, which runs this Done-when and today exits 1 with "not built yet". **Still to do:** build it in Kiro from the brief (KI-44).

**Owns:** `fixtures/candy-swap/`, a small Halloween candy-trading web app (login, market, claim candy, propose a trade, inventory). It also owns the app's seed and reset scripts and **its own `.kiro/specs/candy-swap/`**, generated and built **in Kiro**.
**Not this feature:** anything in Poltergeist itself.

- **User story:** As the team, we need a believable, honestly built app with a real Kiro spec, so the demo shows Poltergeist finding real bugs, and so we have a real Kiro-generated spec to test F01 against (KI-16).
- **User flow:** `npm run --prefix fixtures/candy-swap dev` → open `:4000` → log in as `ghost1` → browse the market → claim candy → propose a trade.
- **Constraints:**
  - Built in Kiro, from a spec Kiro generates. **Keep Kiro's output as is**: it's evidence and a fixture.
  - **No deliberately planted bugs** (D-10).
  - Server-side rendered, minimal JS. SQLite, with `db:reset` in < 1 s.
  - 6–8 requirements, ~25 criteria.
  - It may use the costume palette but doesn't need to.
- **Done when:** the app runs, reset is deterministic, and F01 parses its spec with zero warnings (or each warning becomes a KI-16 note). `npm run candy:check` checks all of this except "the app runs" (D-37).

### F03: Route Scout · High · Done (fixture)

> 2026-10-31: done against a tests-only app shaped like Candy Swap, because F10 isn't built yet (D-30). Plan `docs/plans/2026-10-31-F03-route-scout.md`. Every KI-22 item was built in the first pass. The scout tests pass 3 of 3 pinned to one CPU (`npm run test:guard:1cpu`). **Still to do:** rerun the Done-when against the real Candy Swap once F10 lands (KI-30).

**Owns:** visiting configured routes as each identity, the login heuristic and `fields` overrides, accessibility-snapshot capture, interactive-element lists, trimming, per-route and run-level hashes, and writing `scout/<slug>.json`. Implements Requirement 3.
**Not this feature:** deciding what to click (F05) · running plans (F06).

- **User story:** As the compiler, I need to know what is actually on each page (buttons, fields, labels), so the plans I write target real elements instead of guessed ones.
- **User flow:**
  1. One guarded context per identity, opened one at a time (anonymous, then each account).
  2. Log in if needed.
  3. For each route: `load`, then `networkidle` within budget, capture `ariaSnapshot()`, then resolve labels and testIds.
  4. Write `scout/<slug>.json` and return `scoutHash`.
- **Constraints:**
  - Rules fixed by D-20 and D-21.
  - Sessions stay in memory only.
  - Hard 10 s budget per route.
  - About 4k tokens per route.
- **Prototype lessons:** [LESSONS.md § F03](LESSONS.md#f03-route-scout).
- **Done when:** scouting **the real Candy Swap** lists the "Claim" buttons and trade-form fields by role and name, with every emitted label and testId resolving. Unlike the prototype, no stand-in fixture app is needed, because F10 comes first.

### F04: Core Personas & Input Generators · High · Done

**Owns:** persona definitions for **Wraith, Banshee and Doppelgänger** (behaviour text, allowed steps, generators, actor count, sprite reference), plus the deterministic input generators (naughty strings, emoji, RTL, long, empty, whitespace, fast-check with a fixed seed). Implements Requirement 4.1–4.2.
**Not this feature:** Lich and Revenant (F16) · Changeling (F20) · steering overrides (F17) · drawing the sprites (F26).

- **User story:** As a developer, I want a handful of well-defined misbehaving users, each targeting a different class of bug, so the results are explainable and the inputs are reproducible.
- **User flow:** (internal) The compiler asks `getPersona(id)`. The runner asks `generate(generatorId, seed, index)` and gets the same value every time.
- **Constraints:**
  - Personas are plain data.
  - Generators are pure functions.
  - The naughty-strings list is vendored with its MIT licence.
  - The LLM never writes inputs (D-04).
- **Done when:** a snapshot test shows identical values across runs for the same seed, and each persona has a one-line UI description.

### KI-01 spike (build order 6) · High · TBD

**Owns:** a throwaway script (`scripts/spike-compile.ts`) that compiles 5 Candy Swap criteria × 3 personas with a draft prompt and DSL, runs each plan 10 times with a minimal runner, and writes the numbers to `docs/spike-ki01.md`.
**Not this feature:** production compiler or runner code (F05, F06). The spike's code may be deleted afterwards. Its *findings* become decisions.

- **User story:** As the team, we need to know whether the core assumption holds before building F05 and F06 properly. The prototype never got this far.
- **Done when:** `docs/spike-ki01.md` records:
  - % valid on the first try and after the retry, % flaky, refusals (KI-11) and criteria needing hidden state (KI-02);
  - a go / adjust decision (D-xx) against the bar of ≥ 80% valid or justified `notApplicable` and ≤ 20% flaky.

### F05: Ghost Compiler (LLM → Plan DSL) · High · Done (fixture)

> 2026-10-31: built before the KI-01 spike, against the Candy-shaped fixture with a fake `LlmClient` (D-32). Plan `docs/plans/2026-10-31-F05-ghost-compiler.md`. `compile(criteria, scout, opts)` in `packages/core/src/compiler/`. On the fixture's real Scout output, 15 of 15 pairs are valid or justified `notApplicable`, and a second run makes zero calls (`test/compiler/done-when.test.ts`). **Still to do:** the live run against the real Candy Swap with a real key (KI-34), which feeds the re-scoped KI-01 spike.

**Owns:** the DSL zod schema, route picking (≤ 2 routes per criterion, KI-03), the prompt, the structured-output call, validation, the one retry, `notApplicable`, and the plan cache. Implements Requirement 5.
**Not this feature:** executing plans (F06) · providers other than Anthropic (F19).

- **User story:** As a developer, I want each acceptance criterion turned into concrete, readable plans per persona, so I can see exactly what each ghost will try before it runs.
- **User flow:**
  1. For each criterion × persona: pick the routes, build the prompt (criterion, those routes' snapshots, persona, schema) and call Claude with structured output.
  2. Validate, and reject targets Scout never emitted.
  3. Retry once on failure, else mark the pair `uncompilable`.
  4. Cache, and write `plans/`.
- **Constraints:**
  - Plain QA wording (D-09).
  - ≤ 4 concurrent LLM calls.
  - Prompt version constant.
  - Cache hits make no call.
- **Done when:** compiling Candy Swap gives ≥ 80% valid or justified `notApplicable`, and a second run makes zero LLM calls.

### F06: Ghost Runner · High · Done (fixture)

> 2026-11-01: built before F10, against a claims fixture with a naive check-then-insert endpoint (D-33). Plan `docs/plans/2026-11-01-F06-ghost-runner.md`. `runPlans(browser, loaded, plans, opts)` in `packages/core/src/runner/`. On the fixture, a Doppelgänger plan's two requests reach the server < 50 ms apart in every rep (also on one CPU), the race is found in ≥ 2 of 3 reps (KI-07), and 12 ghosts run at once (`test/runner/done-when.test.ts`). **Still to do:** the full Candy Swap haunting at 12 ghosts in < 5 min (KI-36).

**Owns:** Playwright execution of plans (contexts per actor via `newGuardedContext`, steps, barriers, held requests, throttling, timeouts), reset scheduling and seed partitioning (KI-13), the Doppelgänger's shared session (KI-10), the ghost-cursor overlay injection, artifacts (screenshots, traces, sampled frames), turning guard reports into step outcomes, and run events. Implements Requirement 6 and the runtime parts of 2.5 and 2.7.
**Not this feature:** pass/fail across reps (F07) · rendering anything (F12, F26).

- **User story:** As a developer, I want the plans to run against my real app, many ghosts at once, so race conditions and messy-user bugs actually show up.
- **User flow:**
  1. Launch Chromium with `guardLaunchOptions()`.
  2. For each rep: reset, then schedule plans through the limiter and run the steps, emitting events.
  3. Assert, and capture evidence on failure.
  4. Hand raw results to F07.
- **Constraints:**
  - Step timeout 5 s, plan timeout 60 s.
  - Frames ≤ 4 fps per ghost.
  - `leak` guard reports fail the run as a safety error.
  - `redirect` reports are shown as blocked redirects (D-22).
- **Done when:** a Doppelgänger plan's two actors are released at the barrier < 50 ms apart, and a full Candy Swap haunting at 12 ghosts finishes in < 5 min.

### F07: Verdicts & Flake Filter · High · Done

> 2026-11-01: built per D-34. Plan `docs/plans/2026-11-01-F07-verdicts.md`. `computeVerdicts(pairs, run)` in `packages/core/src/verdicts/`. Table tests cover every path: `haunted` (incl. beside a system error, and at N = 1), `flaky` (incl. one failure beside system errors, and different assertions failing in different reps), `clean` (incl. beside a plan error, and with no assertions), `inconclusive` from plan/blocked/unlabelled assertion failures, timeouts, forbidden-voided reps, missing reps and pairs that never ran, `notApplicable`, `uncompilable` and the criterion rollup; fast-check checks determinism, order independence and monotonicity. On the F06 fixture the Doppelgänger race comes out `haunted`. KI-37's timeout, attribution and rep-error items were folded into the runner.

**Owns:** turning raw results across N reps into pair and criterion verdicts. Implements Requirement 7.
**Not this feature:** formatting (F08) · comparing runs (F14).

- **User story:** As a developer, I want a red mark only when a bug reproduces, so I trust the report and don't chase flakes.
- **Constraints:** a pure function, fully table-tested.
- **Done when:** table tests cover every verdict path, including mixed outcomes and system errors.

### F08: Haunting Report · High · Done (fixture)

> 2026-11-01: built fixture-first (D-35) on `main`'s F07 (`computeVerdicts`, D-34). Plan `docs/plans/2026-11-01-F08-haunting-report.md`. `renderReport` (pure) and `writeReport` (atomic, only `haunting-report.md` and `.json`) live in `packages/core/src/report/`. `test/report/done-when.test.ts` runs the claims fixture's Doppelgänger race through runner → verdicts → report. Criterion 3.2 comes out `[!!]` with steps, expected vs actual, and artifact paths that exist. A fresh Claude Code agent given only the report located the race and described how to reproduce it (KI-38 notes). **Still to do:** the same check in Kiro on real Candy Swap (KI-38). The draft wordmark and glyphs stay in core until F26 (KI-40).

**Owns:** the `haunting-report.md` and `.json` content and wording, in the spec folder. Implements Requirement 8.
**Not this feature:** terminal output (F09) · UI (F12) · the wordmark and glyphs themselves (F26 provides them).

- **User story:** As a developer, or as Kiro's agent, I want a report next to the spec that says which promises are broken and how to reproduce each one, so fixing starts immediately.
- **Constraints:**
  - It never edits other spec files.
  - Fully regenerated each run.
  - Relative artifact paths.
  - About 300 lines max.
  - Uses the THEME §5 report format.
- **Done when:** an agent given only the report can locate and reproduce a haunted Candy Swap criterion. Check once with Kiro and once with Claude Code.

### F26: Costume Kit · High · TBD

**Owns:** `@poltergeist/costume`, which provides:
- the palette tokens (TS + CSS);
- the glyph renderer (Bayer dither → glyph ramp, deterministic, glyph-atlas canvas drawing);
- the wordmark;
- the persona sprites;
- the verdict glyphs;
- the possession and exorcism animations, with their reduced-motion variants;
- the "real frame" toggle component.

Implements Requirement 12.
**Not this feature:** Séance layout and data (F12) · sound, cursor trails and idle motion (F22) · persona behaviour (F04).

- **User story:** As a judge watching a 3-minute video, I want Poltergeist to look like a haunted terminal that's been possessed, so it's memorable and clearly made for Kiroween's Costume Contest.
- **User flow:** the CLI, the report and the Séance import the kit. The Séance passes each ghost frame to `renderGlyphs(frame, grid)` and draws sprites at cursor positions.
- **Constraints:**
  - The rules in [THEME.md](THEME.md).
  - Real text never becomes glyphs.
  - Ectoplasm is for ghosts only.
  - It has to hold 12 tiles × 4 fps.
  - `prefers-reduced-motion` is honoured.
- **Done when:**
  - A demo page renders a Candy Swap screenshot as ASCII, deterministically (a snapshot test on the glyph output), next to the real one.
  - All 3 core sprites and the wordmark are approved by the team.
  - Possession and exorcism play on a sample board line.
  - The page stays readable in a 1080p recording uploaded to YouTube as unlisted (KI-26).

### F09: CLI `summon` · High · Done (fixture)

> 2026-11-01: built fixture-first (D-36). Plan `docs/plans/2026-11-01-F09-cli-summon.md`. Core's `summon()` (`packages/core/src/summon/`) orchestrates config → spec → scout → compile → run → verdicts → report and writes `run.json`, `verdicts.json` and the summon events. `@poltergeist/cli` (bin `poltergeist`, run through tsx) parses the flags, draws the wordmark, a live ghost block on a colour TTY and the final board, maps exit codes 0/1/2/130, and serves `--seance` events on `127.0.0.1:6660`. `packages/cli/test/done-when.test.ts` runs the claims fixture's race end to end and exits 1. KI-41's injection and bidi items and KI-35's write and duplicate-persona items are fixed. **Still to do:** `npm run summon` on real Candy Swap from a clean clone (KI-42), and F26's wordmark and sprites in the terminal (KI-40).

**Owns:** the `poltergeist` binary, `summon`, its flags, themed terminal output and exit codes. Implements Requirement 9.1–9.2.
**Not this feature:** `--only` diffs (F14) · `init` (F13) · `replay` (F15).

- **User story:** As a developer, I want one command that does the whole haunting, so I can run it locally or in CI.
- **User flow:** `npx poltergeist summon --spec .kiro/specs/candy-swap` → load config → scout → compile → run → verdicts → report → board → exit 0, 1 or 2.
- **Constraints:**
  - Works with no TTY.
  - `NO_COLOR` is respected.
  - The `:6660` event server starts only with `--seance`.
  - `ConfigError` and `ResetError` give exit 2.
- **Done when:** the full Candy Swap run works from a clean clone with `npm ci && npx playwright-core install chromium && npm run summon`.

### F11: Kiro MCP Server · High · TBD

**Owns:** `@poltergeist/mcp` (stdio) with `list_criteria`, `summon_ghosts`, `get_haunting_report` and `rehaunt` (subset without a diff until F14). Implements Requirement 10.1–10.2.
**Not this feature:** writing into `.kiro/` (F13) · Power packaging (F18).

- **User story:** As a Kiro user, I want to tell Kiro's agent "summon the ghosts on this spec" and have it run Poltergeist, read the results and fix the code without leaving the IDE.
- **Constraints:**
  - Outputs < 2k tokens.
  - Verify Kiro's MCP timeout and config first (KI-06, KI-12).
  - Tested in Kiro, with Claude Code as the fallback.
- **Done when:** in a Kiro session against Candy Swap, the agent runs summon → report → fix → rehaunt, and a criterion goes haunted → clean.

### F12: Séance Room (Live) · High · TBD

**Owns:** `@poltergeist/seance` (Vite + React) in live mode: the layout, the WebSocket client, the requirement board, the ghost tiles (glyph-rendered frames with sprites at cursor positions via F26), and the haunted highlight with links to evidence. Implements Requirement 11.1–11.3.
**Not this feature:** replay and deployment (F15) · the renderer, sprites and animations (F26) · sound and atmosphere (F22).

- **User story:** As a viewer (developer or judge), I want to _see_ the ghosts swarm the app and the spec lines get possessed, so the result is obvious and memorable.
- **User flow:**
  1. `summon --seance` opens `localhost:6661`.
  2. Tiles appear as ghosts spawn.
  3. Board lines go `[  ]` → `[..]` → `[ok]`/`[~~]`/`[!!]`.
  4. Clicking a possessed line shows the failing frame, with the real-frame toggle.
- **Constraints:**
  - The UI holds 60 fps with 12 tiles.
  - Readable at 1080p.
  - Dark only.
  - No backend besides the WebSocket.
- **Done when:** a 12-ghost Candy Swap run looks good enough to be the centre of the video.

---

## MED

### F14: Re-haunt & Verdict Diff · Med · TBD

**Owns:** `--only <ids>` subset runs, and the diff against the previous `verdicts.json` in CLI output and the `rehaunt` response. Implements Requirement 9.3.
**Not this feature:** the run engine (F06) · the exorcism animation (F26).

- **User story:** As Kiro's agent, after fixing a bug I want to re-test just that criterion and see clearly whether it's now clean.
- **User flow:** `summon --only 3.2` → only 3.2 pairs run → `3.2 [!!] → [ok]`.
- **Constraints:**
  - Uses cached plans unless the criterion text changed.
  - < 30 s per criterion.
- **Done when:** the video's exorcism loop completes with one `rehaunt` call in < 30 s.

### F15: Replay Mode & Deployed Séance · Med · TBD

**Owns:** `poltergeist replay <runDir>`, the Séance replay reader, `poltergeist export` (run → static bundle), and deploying the static replay site. Implements Requirement 11.4.
**Not this feature:** live mode (F12) · a live hosted runner (F21).

- **User story:** As a judge, I want to open a URL and watch a real recorded haunting without installing anything.
- **User flow:** `poltergeist export <runDir> --out dist/` → deploy (D-12) → the judge picks a run → it plays at 1× or 4× with a scrubber.
- **Constraints:**
  - Fully static.
  - < 50 MB per run.
  - Clearly labelled **RECORDED** in the costume style.
- **Done when:** the public URL replays the hero Candy Swap run in a fresh browser.

### F13: Kiro Installer (`init`) + Agent Hook · Med · TBD

**Owns:** `poltergeist init` (scaffolds the config) and writing the MCP entry, `steering/poltergeist.md` and the agent hook into a target's `.kiro/`, idempotently, never overwriting without `--force`. Implements Requirement 10.3.
**Not this feature:** reading steering (F17) · the Power (F18).

- **User story:** As a Kiro user, I want one command to wire Poltergeist into my project, so ghosts summon automatically after Kiro finishes spec tasks.
- **Constraints:** the hook schema and triggers must be verified first (KI-06).
- **Done when:** in a fresh Kiro project, `init` and then a hook trigger start a haunting with no manual MCP setup.

### F16: Extended Personas: Lich & Revenant · Med · TBD

**Owns:** the Lich and Revenant definitions, plus the runner support for `throttle` profiles and `logout` / stale-session sequences.
**Not this feature:** core personas (F04) · Changeling (F20) · their sprites (F26 already draws all six).

- **User story:** As a developer, I want my app tested on slow, small devices and by users with stale sessions.
- **Constraints:**
  - Fixed throttle presets.
  - The Revenant never touches cookies outside the target origin.
  - KI-20 must be fixed first: resolve `env:` passwords for accounts named in `login` steps.
- **Done when:** each persona produces sensible plans for at least 3 Candy Swap criteria.

### F17: Steering-driven House Rules · Med · TBD

**Owns:** reading `.kiro/steering/poltergeist.md` in a target (persona flags, extra `forbidden` rules, route notes) and merging it over the config. Implements Requirement 4.3.
**Not this feature:** writing the file (F13) · config rules (F02).

- **User story:** As a team lead, I want Poltergeist's rules to sit in Kiro steering next to our other project rules.
- **Constraints:**
  - It only ever tightens rules.
  - Unknown keys produce a warning.
  - Fix KI-17 (decode paths before matching) at the same time.
- **Done when:** disabling the Banshee in steering removes all Banshee plans from the next run.

### F18: Kiro Power Packaging · Med · TBD

**Owns:** the Power bundle in `integrations/kiro/power/` and its install docs.
**Not this feature:** MCP code (F11) · `init` (F13).

- **User story:** As a Kiro user, I want Poltergeist as a Power that loads only when I'm testing a spec.
- **Constraints:** the Power format must be verified first (KI-06).
- **Done when:** the Power installs in Kiro and the F11 loop works through it.

---

## LOW

### F22: Séance Atmosphere Polish · Low · TBD

**Owns:** sound (off by default), 3-frame ghost-cursor trails, idle scanline drift and the wordmark flicker.
**Not this feature:** possession and exorcism (F26) · layout (F12).

- **User story:** As a judge, I want the Séance to *feel* haunted even when nothing is failing.
- **Constraints:**
  - `prefers-reduced-motion` is respected.
  - Effects never hide data.
- **Done when:** the video's idle and swarm shots have trails and a subtle drift, with sound available.

### F19: Amazon Bedrock Provider · Low · TBD

**Owns:** `llm.provider: "anthropic" | "bedrock"` and the Bedrock adapter.
**Not this feature:** prompt content or validation (F05).

- **User story:** As an AWS shop, I want to run the compiler through Bedrock in my own account.
- **Done when:** a Candy Swap compile works via Bedrock, and the cache key includes the provider.

### F20: Changeling Persona (keyboard-only) · Low · TBD

**Owns:** the Changeling (Tab, Enter and Space only), its focus-reachability assertion, and focus tracking in the runner.
**Not this feature:** other personas.

- **User story:** As a developer, I want to know whether keyboard-only users can complete each flow in my spec.
- **Done when:** it runs on all Candy Swap flow criteria, and mouse steps are rejected by the schema.

### F21: Hosted Live Sandbox · Low · TBD

**Owns:** a container with Candy Swap + runner + Séance live mode, so judges can press Summon on a locked sandbox (cached plans only, one run at a time, rate-limited).
**Not this feature:** static replay (F15).

- **User story:** As a judge, I want to trigger a real haunting myself.
- **Done when:** the public sandbox survives 10 back-to-back runs.

---

## SCRAPPED

### F23: LLM writes free-form Playwright code · Scrapped
- Flaky, can't be validated, executes arbitrary code, and is more likely to be refused.
- Replaced by the DSL (D-03).

### F24: Live LLM browser agent (computer-use) · Scrapped
- Slow, expensive, not reproducible, hard to demo (D-03).

### F25: Security exploit payload generation · Scrapped
- Not the product's purpose, and a guardrail and misuse risk.
- The Banshee uses a vetted static list (D-04, D-08).

---

## Changelog

- 2026-10-31: PRD recreated for the fresh repo (D-25). Everything is TBD. Compared with the prototype:
  - **F10 moved before F03**, so Scout is tested against the real Candy Swap.
  - **A KI-01 spike was added before F05.**
  - **F26 Costume Kit added** (High), since the target is now Costume Contest (D-23).
  - Possession and exorcism moved from F22 to F26.
  - Prototype lessons linked for F01–F03.
- 2026-10-31: **F01 Done** (D-27). **Scaffold Done**: CI is green on GitHub Actions (PR #1).
- 2026-10-31: **F02 Done** (D-29). CI now installs Chromium for the guard tests.
- 2026-10-31: **F03 Done against a fixture** (D-30). F03 was built before F10; the real Candy Swap check is tracked in KI-30.
- 2026-10-31: **F05 Done against a fixture** (D-32). Built before the KI-01 spike: deterministic route picker, no DSL `literal`, two-pass validation, one retry, plan cache. The live Candy Swap check is KI-34, and the spike is re-scoped to use F05's compiler.
- 2026-11-01: **F06 Done against a fixture** (D-33). Raw per-rep results for F07, conflict-key scheduling (KI-13), shared-session Doppelgänger, rendezvous barrier, request holds, ghost-cursor overlay, frames, artifacts, leak abort. The real Candy Swap check is KI-36.
- 2026-11-01: **F07 Done** (D-34). Pure `computeVerdicts`: ⌈2N/3⌉ of requested reps, app-only failures, forbidden blocks void a rep, `uncompilable` rolls up as `inconclusive`. KI-37's timeout, attribution and rep-error items fixed in the runner.
- 2026-10-31: **F04 Done** (D-31). Three core personas, eight deterministic generators (adds `plain`), vendored BLNS without injection sections. KI-32 opened (typed inputs).
- 2026-11-01: **F08 Done against a fixture** (D-35). The report has a board, fix-ready haunted tasks, a 300-line cap that keeps the first task, and a versioned JSON schema. The Kiro and real Candy Swap check is KI-38. Opened KI-39 (timeouts never haunted), KI-40 (draft wordmark until F26) and KI-41 (review minors).
- 2026-11-01: **F09 Done against a fixture** (D-36). Core `summon()` plus a thin `@poltergeist/cli`: flags, themed board, live ghost block on a colour TTY, exit codes 0/1/2/130, `--seance` loopback event server with replay. Fixed KI-41 (report injection, bidi) and KI-35 (best-effort writes, duplicate personas). The real Candy Swap check is KI-42.
- 2026-11-01: **F10 prep done** (D-37). Kiro brief, Candy Swap's `poltergeist.config.json`, `npm run candy:check` (F10's Done-when) and a skipped real-spec F01 test. The app itself is built in Kiro (KI-44). Candy Swap is a standalone package, not a root workspace.
