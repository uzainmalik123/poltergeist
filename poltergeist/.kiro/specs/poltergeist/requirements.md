# Requirements Document

## Introduction

Poltergeist reads a Kiro spec and turns each acceptance criterion into a group of adversarial "ghost users". These ghosts test the real running app in a browser. Poltergeist then reports which promises in the spec are *haunted* (broken), in the spec folder, where Kiro's agent can read the report, fix the code and re-check it.

It's for developers who build with Kiro specs and want proof that the shipped app actually meets `requirements.md`, beyond the task list being ticked off.

This file is the source of truth for *what must be true*. Feature scopes and priorities are in `docs/PRD.md`. Each requirement below names its PRD feature(s) in brackets. Decisions (`D-xx`) are in `docs/DECISIONS.md`.

Criterion IDs follow Kiro's convention (`N.M`, D-16), so Poltergeist's own Spec Reader (F01) can parse this file. It is a test fixture.

## Glossary

- **Spec:** a Kiro spec folder, `.kiro/specs/<name>/` with `requirements.md` (+ `design.md`, `tasks.md`).
- **Criterion:** one numbered acceptance-criterion line, ideally EARS (`WHEN … THE <subject> SHALL …`), identified as `N.M`.
- **Target:** the running web app under test, given as an origin (e.g. `http://localhost:4000`).
- **Scout:** a read-only pre-pass that records each route's accessibility snapshot and interactive elements.
- **Persona / Ghost:** a built-in pattern of adversarial user behaviour (Wraith, Banshee, Doppelgänger, Lich, Revenant, Changeling).
- **Haunting Plan:** a JSON program in the Poltergeist DSL for one criterion × one persona. The LLM writes it; it is validated and run deterministically.
- **Run / Haunting:** one execution of all plans for a spec against a target.
- **Verdict:** per pair or criterion: `haunted`, `flaky`, `inconclusive`, `clean` (plus `notApplicable` / `uncompilable` for pairs).
- **Séance Room:** the web dashboard showing a run live or as a replay.
- **Costume Kit:** the shared ASCII theme (glyph renderer, sprites, palette, wordmark) used by the CLI, the report and the Séance Room.

## Requirements

### Requirement 1: Reading specs [F01]

**User Story:** As a developer with a Kiro spec, I want Poltergeist to understand my acceptance criteria exactly as written, so that I don't have to restate my requirements anywhere else.

#### Acceptance Criteria

1. WHEN the user points Poltergeist at a spec folder, THE Spec_Reader SHALL parse `requirements.md` into criteria, each with its ID, requirement title, requirement ID, raw markdown, plain text, line number, EARS kind and EARS clauses.
2. THE Spec_Reader SHALL assign each criterion the ID `N.M`, where `N` is the number in its `Requirement N` heading and `M` is its rendered list number, and SHALL keep that ID stable while the file's structure is unchanged.
3. IF a requirement number appears more than once, THEN THE Spec_Reader SHALL suffix later occurrences (`3b`, `3c`) and emit a warning.
4. IF a criterion contains no SHALL, THEN THE Spec_Reader SHALL keep it with kind `freeform` and SHALL NOT drop it.
5. THE Spec_Reader SHALL classify EARS kinds by deterministic keyword rules, never by an LLM.
6. THE Spec_Reader SHALL compute a content hash per criterion over its normalized text only, so that the plan cache survives renumbering.
7. IF the spec layout can't be read (bulleted criteria, an extra list, an unrecognized heading, an empty file), THEN THE Spec_Reader SHALL return a named warning and SHALL NOT throw.
8. IF `requirements.md` is missing or unreadable, THEN THE Spec_Reader SHALL throw `SpecNotFoundError`.

### Requirement 2: Target configuration and safety [F02]

**User Story:** As a developer, I want Poltergeist to touch only the app I point it at, with the number of ghosts limited, so that I can never aim it at someone else's site or flood my own server.

#### Acceptance Criteria

1. THE Config_Loader SHALL read a strict `poltergeist.config.json` (unknown keys are errors) with target origin, allowed hosts, routes, accounts, reset command, concurrency, reps, forbidden rules and model.
2. IF `target` has a path, query or hash, THEN THE Config_Loader SHALL reject it with a field-path error.
3. IF the target host is not `localhost`, `127.0.0.1`, `::1` or listed in `allowedHosts`, THEN THE Config_Loader SHALL refuse to start and explain why.
4. WHILE a run is in progress, THE Network_Guard SHALL block every request, redirect hop, WebSocket and WebRTC connection to a host outside the allowlist, and report each block with a reason.
5. IF a request matches a `forbidden` method and path rule, THEN THE Network_Guard SHALL abort it and the runner SHALL mark the step that caused it `blocked-by-rule`.
6. THE Config_Loader SHALL cap concurrency at the configured limit (default 12) and SHALL reject values above 20.
7. WHEN a `resetCommand` is configured, THE Runner SHALL run it before each repetition, with a timeout, and SHALL treat a failed reset as a system error, never an app bug.
8. THE Config_Loader SHALL resolve `env:NAME` secrets at load time and SHALL redact resolved secrets from every log, report and run file.

### Requirement 3: Scouting [F03]

**User Story:** As the compiler, I need to know what is actually on each page, so that the plans I write target real elements instead of guessed ones.

#### Acceptance Criteria

1. WHEN a run starts, THE Scout SHALL visit each configured route as the right identity (anonymous or a configured account) and record an accessibility snapshot plus interactive elements (role, name, label, test id).
2. THE Scout SHALL log in with a heuristic by default, and SHALL use an account's `fields` override (D-15 targets) when one is given.
3. THE Scout SHALL keep login sessions in memory only and SHALL NOT write them to disk.
4. THE Scout SHALL only emit a `label` or `testId` that resolves to exactly one element.
5. IF a route fails to load, redirects or fails login, THEN THE Scout SHALL record its status (`unreachable`, `redirected`, `authFailed`) with a reason and continue with the other routes.
6. THE Scout SHALL keep each route's prompt-facing snapshot under about 4k tokens, and SHALL hold each route to a hard time budget.
7. THE Scout SHALL compute a per-route hash over status and interactive elements only, and a run-level `scoutHash`.

### Requirement 4: Personas and inputs [F04, F16, F20]

**User Story:** As a developer, I want a handful of well-defined misbehaving users with reproducible inputs, so that results are explainable and repeatable.

#### Acceptance Criteria

1. THE Persona_Library SHALL define each built-in persona with an id, display name, one-line tagline, behaviour, allowed DSL steps, input generators, actor count and a sprite reference resolved by the Costume Kit.
2. THE Input_Generators SHALL produce values deterministically from a generator id, a seed and an index, and the LLM SHALL only choose generator ids, never write values.
3. WHERE the target project has a Poltergeist steering file, THE Persona_Library SHALL apply its persona enable/disable flags, and steering SHALL only ever tighten rules [F17].

### Requirement 5: Compiling plans [F05]

**User Story:** As a developer, I want each criterion turned into readable test plans per persona, so that I can see exactly what each ghost will try before it runs.

#### Acceptance Criteria

1. WHEN compiling, THE Compiler SHALL send the LLM one criterion, the snapshots of at most two relevant routes and one persona definition, and request a Haunting Plan as structured output.
2. IF a plan fails schema validation, THEN THE Compiler SHALL retry once with the errors, and after that mark the pair `uncompilable`.
3. IF the LLM decides a persona doesn't apply to a criterion, THEN THE Compiler SHALL accept `notApplicable` with a reason.
4. THE Compiler SHALL only accept targets that appear in the Scout output.
5. THE Compiler SHALL cache plans keyed by criterion hash, persona, the used routes' hashes, model and prompt version, and SHALL make no LLM call on a cache hit.
6. THE Compiler SHALL describe the task as edge-case end-to-end test generation for an app the user owns, and SHALL keep theme words out of prompts (D-09).

### Requirement 6: Running [F06]

**User Story:** As a developer, I want plans to run against my real app with many ghosts at once, so that race conditions and messy-user bugs actually show up.

#### Acceptance Criteria

1. THE Runner SHALL execute plans with Playwright Chromium, launched with the guard's launch options, with each actor in its own guarded context.
2. THE Runner SHALL run each plan N times (default 3).
3. WHEN a plan uses `barrier`, THE Runner SHALL release all actors together once every actor reaches it.
4. WHEN a plan uses `holdRequests`, THE Runner SHALL keep matching requests pending until the matching `releaseRequests` step.
5. WHILE running, THE Runner SHALL emit run events to subscribers and append them to the run folder.
6. THE Runner SHALL inject a visible ghost-cursor overlay into each page, so that frames and recordings show where each ghost acts.
7. THE Runner SHALL save a screenshot on every failed assertion and a trace per failed repetition.
8. IF a step exceeds 5 s or a plan exceeds 60 s, THEN THE Runner SHALL abort that repetition with a `timeout` outcome.

### Requirement 7: Verdicts [F07]

**User Story:** As a developer, I want a red mark only when a bug reproduces, so that I trust the report.

#### Acceptance Criteria

1. THE Verdict_Engine SHALL mark a pair `haunted` when the same assertion fails in at least ⌈2N/3⌉ of N repetitions.
2. THE Verdict_Engine SHALL mark a pair `flaky` when an assertion fails at least once but fewer than ⌈2N/3⌉ times.
3. THE Verdict_Engine SHALL mark a pair `inconclusive` when failures come from the plan or the system, not from an app assertion.
4. THE Verdict_Engine SHALL roll pairs up per criterion with the precedence `haunted` > `flaky` > `inconclusive` > `clean`, ignoring `notApplicable`.

### Requirement 8: Reporting [F08]

**User Story:** As a developer, or as Kiro's agent, I want a report next to the spec that says which promises are broken and how to reproduce each one, so that fixing starts immediately.

#### Acceptance Criteria

1. WHEN a run finishes, THE Reporter SHALL write `haunting-report.md` and `haunting-report.json` into the spec folder.
2. THE Reporter SHALL phrase each haunted entry as a fix-ready task: the promise, the persona, the steps, expected vs actual, and artifact paths.
3. THE Reporter SHALL NOT modify `requirements.md`, `design.md` or `tasks.md`.

### Requirement 9: Command line [F09, F14]

**User Story:** As a developer, I want one command that does the whole haunting, so that I can run it locally or in CI.

#### Acceptance Criteria

1. THE CLI SHALL provide `poltergeist summon --spec <dir>` with `--config`, `--only`, `--personas`, `--reps`, `--recompile` and `--seance`.
2. THE CLI SHALL exit 0 when nothing is haunted, 1 when anything is haunted, and 2 on a configuration or system error.
3. WHEN `--only` is given, THE CLI SHALL re-run only those criteria and show each verdict change against the previous run [F14].

### Requirement 10: Kiro integration [F11, F13, F17, F18]

**User Story:** As a Kiro user, I want Kiro's agent to summon the ghosts, read the results and fix my code without leaving the IDE.

#### Acceptance Criteria

1. THE MCP_Server SHALL expose `list_criteria`, `summon_ghosts`, `get_run_status`, `get_haunting_report` and `rehaunt` over stdio.
2. THE MCP_Server SHALL return small summaries (counts and haunted IDs) and SHALL NOT put artifacts into the agent's context.
3. THE Installer SHALL write the MCP entry, a steering file and an agent hook into a target's `.kiro/`, and SHALL NOT overwrite existing files without `--force` [F13].
4. THE Power SHALL bundle the MCP server and steering as an installable Kiro Power [F18].

### Requirement 11: Live Feed and Replay [F12, F15]

**User Story:** As a renderer (Reanimator's attack scene), I want a live, render-agnostic view of a run, so that I can show the ghosts attacking the app and the spec lines changing as it happens.

#### Acceptance Criteria

1. WHILE a run is live, THE Live_Feed SHALL provide one ghost entry per active ghost with its current step, cursor position and latest frame.
2. THE Live_Feed SHALL provide the requirement board: each criterion line with its live status (`waiting`, `running`, then its verdict).
3. WHEN a criterion becomes `haunted`, THE Live_Feed SHALL link its line to the failing ghost and that ghost's evidence frame in the run folder.
4. THE Seance_Room SHALL replay a finished run from its run folder with no live target, LLM or browser, and SHALL label it as a recording [F15].

### Requirement 12: Costume [F26, F22]

**User Story:** As a judge watching a three-minute video, I want Poltergeist to look like a haunted terminal, so that it is memorable and clearly built for Kiroween.

#### Acceptance Criteria

1. THE Costume_Kit SHALL render any image or frame as coloured ASCII glyphs using ordered (Bayer) dithering, deterministically for the same input.
2. THE Costume_Kit SHALL keep all real text (criteria, steps, numbers, buttons) as real, selectable text and SHALL only turn imagery into glyphs.
3. THE Costume_Kit SHALL reserve the ectoplasm colour for ghosts only, and the verdict colours for verdicts only (`docs/THEME.md`).
4. WHERE the viewer prefers reduced motion, THE Costume_Kit SHALL stop all flicker, drift and glitch animation.
5. THE Seance_Room SHALL offer a toggle from the ASCII view of a frame to the real screenshot, so that a judge can check the evidence.
6. THE CLI and THE Reporter SHALL use the same wordmark, sprites and verdict glyphs as the Séance Room.
