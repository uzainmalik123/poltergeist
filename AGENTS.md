# AGENTS.md: read this first

Context for every agent or session working in this repo. Keep it current: when something here changes, update this file in the same commit.

## What this is

**Poltergeist** is our entry for **Kiroween 2026** (the Kiro hackathon on Devpost; Kiro is AWS's agentic IDE), in the **Costume Contest** category (D-23).

It reads a Kiro spec (`.kiro/specs/<name>/requirements.md`, EARS-style criteria). For each acceptance criterion, an LLM compiles a constrained JSON **Haunting Plan** per adversarial "ghost" persona. Playwright runs those plans deterministically against the user's own running app. Poltergeist then writes `haunting-report.md` into the spec folder, so Kiro's agent can fix the *haunted* (broken) criteria and re-check them.

- **Personas:** Wraith (double-submits), Banshee (chaotic input), Doppelgänger (two tabs racing), Lich (slow and small device), Revenant (stale session), Changeling (keyboard-only).
- **The costume (D-24, [docs/THEME.md](docs/THEME.md)):** a haunted terminal. Everything visual is ASCII glyphs (Bayer-dithered), only ghosts glow ectoplasm green, and verdicts are red, amber or grey.
- **Hero demo moment:** a swarm of green ASCII ghosts over the app, a real race condition, and a line in `requirements.md` getting possessed (red `[!!]`), then exorcised to `[ok]` after Kiro fixes it.

## Current state (2026-10-31)

- **Scaffold and F01 Spec Reader are built** (`packages/core/src/spec/`, D-27). `npm run health` is green locally and in CI (PR #1). **Next: F02**, then F10 (in Kiro), then F03.
- **The prototype** lives at `../poltergeist-old` (private, built before the hacking window). It is **read-only and off-limits for code**: don't copy, port or open `../poltergeist-old/packages/` while implementing. Everything worth keeping is already in `docs/DECISIONS.md`, `docs/KNOWN_ISSUES.md` and `docs/LESSONS.md`. This keeps every line of code inside the hacking window (KI-24).
- **`.kiro/` is real** in this repo. It holds the spec (`.kiro/specs/poltergeist/`) and steering. Commit it, and never gitignore it.

## Where things are: the source of truth

| File | Use it for |
|---|---|
| `.kiro/specs/poltergeist/requirements.md` | **What must be true.** Requirements 1–12, EARS, Kiro format, IDs `N.M`. F01 must parse it |
| `.kiro/specs/poltergeist/design.md` | How it fits together: architecture, config, guard, DSL, events, run folder, MCP |
| `.kiro/specs/poltergeist/tasks.md` | The build order as a Kiro task list (mirrors the PRD) |
| `.kiro/steering/*.md` | Product, tech and structure summaries that Kiro loads automatically |
| `docs/PRD.md` | **What to build next.** Build order, priorities, status, Owns / Not-this-feature scopes, user stories, flows, constraints, "Done when" |
| `docs/THEME.md` | The costume: palette, glyph renderer, sprites, wordmark, motion, don'ts |
| `docs/DECISIONS.md` | D-01…D-26. Don't contradict these; add a new decision to change one |
| `docs/KNOWN_ISSUES.md` | KI-01…KI-27. Open risks, worked through one at a time |
| `docs/LESSONS.md` | What the prototype learned per feature. **Read the feature's section before grilling it** |
| `docs/STACK.md` | Technology, SaaS, AWS, ports, pinned versions |
| `docs/plans/` | Per-feature implementation plans, written in the plan step of each cycle |

## Keep the docs current (mandatory, every session)

**Before you end a session, or hand back to the user, update `docs/KNOWN_ISSUES.md` and `docs/DECISIONS.md` if anything changed.** Treat it as part of the task, not optional cleanup.

- **KNOWN_ISSUES.md:**
  - Found a new bug, risk, blocker or unknown? Add a `KI-xx` entry with severity, the features it blocks, and the next action.
  - Learned something about an existing issue? Update it (`Investigating`, notes, or `Resolved` with the date and what fixed it).
  - Never delete entries.
- **DECISIONS.md:**
  - Made or confirmed a choice future sessions must respect? Add a `D-xx` with context, decision and consequences.
  - The team signed off on a `Proposed` decision? Set it to `Accepted`.
  - Changing an `Accepted` decision? Add a new one and mark the old one `Superseded by D-xx`. Never rewrite it.
- **The spec:** if a decision changes *what must be true*, update `.kiro/specs/poltergeist/requirements.md` (and `design.md` if it changes *how*) in the same change.
- **Update the summary tables** at the top of each file as well as the detailed sections.
- **When the PRD changes** (status, priority, scope), update `docs/PRD.md`, `.kiro/specs/poltergeist/tasks.md` and the PRD changelog.
- **If nothing changed, say so** in your final message ("KNOWN_ISSUES/DECISIONS: no changes").

## Health check (mandatory, after every implementation)

**Run `npm run health` after every implementation step and before you report back, commit, merge or hand off.** It runs typecheck, lint and the full test suite, the same as CI (D-19).

- **It must exit 0, with every test passing and no new warnings.** Red means not done. Never skip, disable or loosen a test, lint rule or type check to turn it green.
- **This applies to every change**, including fixes, refactors, dependency bumps and subagent work. A subagent's own report of green tests doesn't count; the session that reports back runs it itself.
- **Quote the result** in your final message (for example "health: 148/148 tests, typecheck and lint clean"). If you couldn't run it, say so and why.
- **CI** (`.github/workflows/ci.yml`, created in build order 0) runs the same command on every push to `main` and every PR. A red CI on `main` is the top priority.
- **Browser tests need Chromium:** run `npx playwright-core install chromium` once per machine. For guard or Scout flakes, reproduce on one CPU first (`taskset -c 0 …`, LESSONS § process 6).

## The work cycle: grill → plan → implement → review

Each PRD feature (or KNOWN_ISSUES item) goes through this cycle. The skills are installed for this project only: superpowers through `.claude/settings.json`, and grilling in `.claude/skills/`.

| Step | Skill | Input → output |
|---|---|---|
| 1. **Grill** | `/grill-me` (runs `grilling`) | The feature's PRD section + its LESSONS section + related D/KI entries → shared understanding. Record new decisions and risks |
| 2. **Plan** | `/superpowers:writing-plans` | The grilled feature + `.kiro/specs/poltergeist/` → a task-by-task TDD plan in **`docs/plans/YYYY-MM-DD-<feature-id>-<slug>.md`** (overrides the superpowers default folder). Its acceptance is the feature's "Done when" |
| 3. **Implement** | `/superpowers:subagent-driven-development` (many or interdependent tasks) or `/superpowers:executing-plans` (small plans) | The plan → code + tests, inside the feature's **Owns** scope |
| 4. **Review** | `/superpowers:requesting-code-review`, then the built-in `/code-review` | The diff vs the plan and spec → findings fixed, or logged as KI entries |
| 5. **Close** | n/a | Run "Done when" and `npm run health`. Set PRD status to `Done`, tick `tasks.md`, add a changelog line, update KNOWN_ISSUES/DECISIONS |

- Don't use superpowers' `brainstorming` for features already in the PRD. Grill instead.
- **Commits:** follow the plan's commit steps only if the user has OK'd commits for this cycle. Otherwise stage the changes and report. Commit messages are `F05: <what>`.
- **Worktrees** are fine. Merge back to `main` and clean up before closing the cycle.

## Hard rules (from decisions)

- **Fresh code only (D-25):** nothing is ported from `../poltergeist-old`.
- **LLM only at compile time** (D-03). It outputs DSL JSON validated by zod. No free-form Playwright code, no live browser driving.
- **The LLM never generates input payloads** (D-04). Generators do.
- **Plain QA wording in prompts** (D-09). Theme words never go into prompts.
- **Safety** (D-05, D-07, D-08, D-17):
  - the allowlist is loopback-only by default, and extends but never replaces;
  - steering only tightens rules;
  - concurrency is 12 by default, max 20;
  - not a security scanner.
- **Network guard (D-18, D-22):** launch Chromium with `guardLaunchOptions()` and create every context through `newGuardedContext`. Never build guarded contexts by hand.
- **Verdicts must reproduce** (D-06). Plan errors are `inconclusive`, never app bugs.
- **Never edit the user's `requirements.md`, `design.md` or `tasks.md`** (D-14).
- **DSL targets** are only `{role,name}`, `{label}`, `{text}` or `{testId}`, and only ones Scout emitted (D-15, D-21).
- **Candy Swap is built in Kiro, honestly, with no planted bugs** (D-10).
- **Kiro is integrated, not just used to write the code (D-01).** Templates for *other* projects go in `integrations/kiro/`.
- **Costume (D-24):**
  - ectoplasm green for ghosts only;
  - real text never becomes glyphs;
  - always give a real-frame toggle;
  - honour `prefers-reduced-motion` and `NO_COLOR`;
  - nothing borrowed from Reanimator's assets or story.

## Stack (short version; details in docs/STACK.md)

- **Language and tooling:** TypeScript on Node ≥ 22, ESM, npm workspaces. `tsx`, `vitest` and `eslint`.
- **Packages:**
  - `core` (engine)
  - `costume` (ASCII kit)
  - `cli`
  - `mcp` (stdio)
  - `seance` (Vite + React + Tailwind)
  - `fixtures/candy-swap` (Hono + better-sqlite3, built in Kiro)
- **Libraries:** playwright-core (Chromium), zod 4, unified/remark-parse, fast-check, `@anthropic-ai/sdk` (default `claude-sonnet-5-5`), `@modelcontextprotocol/sdk`, ws.
- **Ports:** 4000 Candy Swap · 6660 runner WebSocket · 6661 Séance.
- **Secrets:** Doppler (`doppler run -- …`), `.env.example` fallback. Never commit keys.
- **SaaS:** Anthropic API, GitHub, Doppler, Kiro, YouTube and Devpost are required. Google Fonts too. Vercel is Med (D-12 open) and Fly.io is Low.
- **AWS:** only Bedrock, as an optional provider (F19, Low).

## Hackathon context

- **Window:** reportedly 31 Oct to **4 Dec 2026, 2pm PT**. "Only new projects count" (KI-05, KI-24: confirm both in the 2026 rules).
- **Categories (2025, said to be the same in 2026):**
  - Resurrection
  - Frankenstein (our fallback)
  - Skeleton Crew
  - **Costume Contest** (our target, D-23)
  - Best Startup
  - Bonus prizes: Most Creative, Blog Post, Social Blitz
- **Judging, roughly equal weights:** Potential Value · Implementation (*how well Kiro is used*) · Quality & Design.
- **Submission requirements:**
  - A public repo with an OSI licence and a committed `.kiro/`.
  - A working app URL (the F15 replay).
  - A public video under 3 minutes.
  - A write-up of the Kiro features used, which also states honestly that the idea was prototyped before the event and rebuilt (KI-24).
- **Off-limits ideas** (team decisions; don't propose them):
  - InteractionKit-style gesture templates;
  - camera/computer-vision interaction;
  - reviving old repos (a friend's **Reanimator**, `../reanimator`, is read-only for us);
  - retro-OS revivals, ELIZA bots, haunted code reviewers, legacy modernizers, horror games.

## Do first (as of 2026-10-31)

1. **KI-05 / KI-24:** read the 2026 rules (kiroween.devpost.com/rules). Check tracks, deadline, team size, video cap, "new projects" and "working app". Update D-23, the PRD timeline and this file.
2. **F02 → F10 (in Kiro) → F03**, each through the cycle, with its LESSONS section open.
3. **KI-06:** verify the Kiro hook, MCP and Power formats before F11, F13 or F18.
4. **F26:** iterate on the sprites and wordmark with the user early (from week 2). The THEME drafts are only a start.

## Tools available to sessions

- **`hackathon-ai-strategist` subagent** (`~/.claude/agents/`): ideation, scope triage, pitch and demo planning.
- **Project skills:**
  - `superpowers` plugin (obra/superpowers, MIT, official marketplace). It adds a SessionStart hook that loads its skill guide.
  - `grill-me` / `grilling` (mattpocock/skills, MIT).
