# Requirements: Reanimator

## Introduction

Reanimator revives dead JavaScript web projects. Given a GitHub URL or a local path, it admits the project into an isolated operating room, diagnoses why it died, writes a chart of what the project is supposed to do, plans the revival, has Kiro agents perform the surgery, and proves the result with deterministic vital checks. It produces a revived branch, a patch, a PR description, an autopsy report and evidence. A live dashboard shows the whole thing happening.

Glossary: **patient** = the dead project. **Operating room (OR)** = the run's Docker container. **Vitals** = the deterministic checks defined in product.md. **Chart** = a Kiro spec describing what the patient does, plus frozen smoke tests. **Round** = one surgery pass followed by one examination.

---

### Requirement 1: Admit a patient

**User story:** As a developer, I want to hand Reanimator a repo URL or path, so that it starts a revival without any setup on my side.

1. WHEN the user runs `reanimator revive <github-url|path>` THE SYSTEM SHALL create a run folder, start an OR container from the pinned image, and copy or clone the patient into `/work/patient`.
2. WHEN the patient is admitted THE SYSTEM SHALL build a case file containing: the last 50 commits (date, author, subject), first/last commit dates, README, every package manifest (package.json, bower.json, lockfiles), build config files (Gruntfile, gulpfile, webpack config, Karma config), the license, and (if `GITHUB_TOKEN` is set) up to 30 issue titles mentioning build, install, broken, node or error.
3. IF the patient has no OSI-approved license THEN THE SYSTEM SHALL continue but mark the run `license: unknown|non-osi` and the report SHALL say it must not be published.
4. IF the patient is not a JavaScript web project (no package.json, bower.json or index.html at the root or one level down) THEN THE SYSTEM SHALL stop with status `not-admitted` and a reason.

### Requirement 2: Confirm death (baseline vitals)

**User story:** As a judge watching the demo, I want to see that the project really was dead, so that the revival means something.

1. WHEN the case file is built THE SYSTEM SHALL run all vitals against the untouched patient on Node 22 and save the results as `vitals-before.json` with full logs.
2. IF all baseline vitals pass THEN THE SYSTEM SHALL stop with status `not-dead` (nothing to revive).

### Requirement 3: Autopsy

**User story:** As a developer, I want to know why the project died, so that I understand what was changed and why.

1. WHEN baseline vitals fail THE SYSTEM SHALL start a Coroner agent session that reads the case file and failure logs and writes `autopsy.json` matching the `Autopsy` schema: probable time of death, causes of death (each with evidence: log lines, file and line, package and version), era tags, and a plain-language summary under 120 words.
2. THE SYSTEM SHALL render `autopsy.md` from `autopsy.json` for the report.

### Requirement 4: Chart (spec of the patient)

**User story:** As a developer, I want a written description of what the project is supposed to do, so that the revival is checked against the original behavior, not against whatever the agents produced.

1. WHEN the autopsy is complete THE SYSTEM SHALL start an Archivist agent session that writes a Kiro spec for the patient (`requirements.md` and `design.md` under the patient's `.kiro/specs/original/`) from the README, code and history.
2. THE Archivist SHALL write between 3 and 10 Playwright smoke checks to `/work/.reanimator/chart/smoke.spec.ts`, each tied to a requirement in the chart (for example "page title contains X", "clicking #add appends a list item").
3. WHEN the chart is accepted THE SYSTEM SHALL compute SHA-256 checksums of the smoke tests and vitals config and SHALL treat any later modification by an agent as a policy violation that fails the round.
4. THE SYSTEM SHALL keep chart files out of the final patient diff.

### Requirement 5: Plan

**User story:** As the orchestrator, I need a revival plan as structured tasks, so that I can assign, track and verify the surgery.

1. WHEN the chart is accepted THE SYSTEM SHALL start a Planner agent session that writes `plan.json` matching the `Plan` schema: ordered tasks with id, title, rationale (linked to a cause of death), files likely touched, depends-on ids, and a `phase` of `toolchain` or `code`.
2. THE plan SHALL prefer the minimal-change ladder in era steering: keep old versions that still install, upgrade only what's broken, and never migrate frameworks.

### Requirement 6: Surgery

**User story:** As a developer, I want Kiro agents to make the changes in isolation, so that my machine and the original repo stay safe.

1. WHEN a task is ready THE SYSTEM SHALL start a Surgeon agent session in the OR with its working directory set to the patient (M1) or to a dedicated git worktree (M4), give it the task, the autopsy, the chart and the relevant era steering, and wait for `surgeon-<taskId>.json` matching the `SurgeryReport` schema.
2. THE SYSTEM SHALL copy era steering docs matching the autopsy's era tags into the patient's `.kiro/steering/` before surgery, and exclude them from the final diff.
3. WHILE a Surgeon session runs THE SYSTEM SHALL answer every permission request through the policy engine, which allows edits inside the patient and package installs, and denies: edits to chart/vitals files, `git push`, network fetches outside the npm registry, GitHub and the time-machine MCP, and any path outside `/work`.
4. WHERE M4 parallel surgery is enabled THE SYSTEM SHALL run up to `--parallel N` code-phase tasks at once, each in its own worktree, and merge them in dependency order. A merge conflict becomes a new conflict-resolution task.

### Requirement 7: Examination and rounds

**User story:** As a developer, I want every surgery checked by real tests, so that "revived" is a fact.

1. WHEN surgery for a round finishes THE SYSTEM SHALL run all vitals and save `vitals-round-<n>.json`.
2. IF any vital fails and the round count is below `--max-rounds` (default 4) THEN THE SYSTEM SHALL create follow-up tasks containing the failing vital's log tail (last 120 lines) and start another round.
3. WHEN all vitals pass THE SYSTEM SHALL mark the run `revived`, commit the result on branch `reanimator/revival`, and produce the outputs in Requirement 8.
4. IF the round limit is reached THEN THE SYSTEM SHALL mark the run `failed` and still produce the report with the best vitals reached.

### Requirement 8: Outputs

**User story:** As a developer, I want everything needed to review and use the revival.

1. THE SYSTEM SHALL write to the run folder: `case.json`, `autopsy.json/.md`, the chart, `plan.json`, `events.ndjson`, all `vitals-*.json`, before/after screenshots, `revival.patch`, `PR_BODY.md` and `report.html`.
2. `PR_BODY.md` SHALL list each change with its reason, how it was verified, the vitals table before/after, and a clear statement that the changes were made by AI agents and reviewed by a human before submission.
3. THE report SHALL include a **faithfulness** figure: the share of the original source files (excluding manifests, lockfiles and build config) left unchanged.

### Requirement 9: Live theater

**User story:** As a demo viewer, I want to watch the revival happen.

1. WHILE a run is active THE SYSTEM SHALL stream run events over SSE at `/api/runs/:id/events`.
2. THE dashboard SHALL show: the graveyard of runs, and per run the heart monitor (flatline → beating, driven by vitals), the vitals checklist, a live feed per agent (condensed tool calls and messages), the plan with task status, and before/after evidence.

### Requirement 10: Benchmark

**User story:** As the team, we want a revival rate on real dead repos, so that the claim in the video is a measured number.

1. WHEN the user runs `reanimator bench graveyard/graveyard.json` THE SYSTEM SHALL revive each listed repo sequentially and write `bench.json` and `bench.md` with per-repo status, rounds, wall time, faithfulness and causes of death, plus the overall revival rate.

### Requirement 11: Safety and cost

1. THE SYSTEM SHALL never push to, open PRs on, or file issues against a third-party repository.
2. THE SYSTEM SHALL enforce per-step time budgets and the round limit, and SHALL record per-session usage if Kiro exposes it.
3. THE SYSTEM SHALL keep `KIRO_API_KEY` only in the OR process env and `GITHUB_TOKEN` only on the host, and SHALL never write either to logs or run folders.
