# Reanimator: Product Requirements (PRD)

> Last updated: 2026-11-01 · Target: Kiroween 2026, **Frankenstein** category (a mash-up of two systems). Costume is a strong secondary angle.
> Story: [STORY.md](STORY.md) · Art: [THEME.md](THEME.md) · Decisions: [DECISIONS.md](DECISIONS.md) · Issues: [KNOWN_ISSUES.md](KNOWN_ISSUES.md) · Stack: [STACK.md](STACK.md) · Spec: [`.kiro/specs/reanimator/`](../.kiro/specs/reanimator/requirements.md)
> **Who builds this:** the teammate, vibe-coding with an agent. The agent should hold their hand (see [AGENTS.md](../AGENTS.md)). Every feature below is written to be buildable with agent help.

## How to use this doc

- **Status:** `TBD` · `Done` (built _and_ its "Done when" passes) · `Scrapped` (with the reason kept).
- **Priority:** `High` = no demo without it. `Med` = makes it competitive. `Low` = only if time allows.
- **Build order:** follow the order column. Get the **vertical slice** (R0→R5) working end to end on ONE prepared repo before widening.
- **Scopes don't overlap.** Each feature has an **Owns** line.
- IDs are `R0…R11` to avoid clashing with Poltergeist's `F…` ids.

## The mash-up in one picture

```
  Reanimator (this app, the necromancer's world, all the UI + art)
  ┌───────────────────────────────────────────────────────────────┐
  │  graveyard → RAISE a dead repo → it runs → DEATH attacks it →  │
  │              findings (wounds) → HEAL with Kiro → re-attack     │
  └───────────────────────────────┬───────────────────────────────┘
                                   │ Death's attack =
                                   ▼
                 Poltergeist engine  (../poltergeist, already built, headless)
                 reads a spec of the revived app, runs persona attacks,
                 returns haunting-report.json  → Reanimator draws it as wounds
```

**Division of labour:** Reanimator owns the story, the art and the flow. Poltergeist owns the attack engine (done). Reanimator *calls* Poltergeist; it never re-implements the attacks.

## Status board

| Order | ID | Feature | Priority | Status |
|---|---|---|---|---|
| 0 | R0 | Scaffold (Vite + React + TS, canvas, health gate, CI) | High | TBD |
| 1 | R1 | Dot-matrix renderer (the art engine) | High | TBD |
| 2 | R2 | The Raise: revive one prepared dead repo, prove it with vitals | High | TBD |
| 3 | R3 | Death's attack: wire in the Poltergeist engine | High | TBD |
| 4 | R4 | The attack scene: draw Death + minions over the running app | High | TBD |
| 5 | R5 | Wounds + heal loop: show findings, fix with Kiro, re-attack | High | TBD |
| 6 | R6 | The graveyard: pick a dead repo | Med | TBD |
| 7 | R7 | The grimoire: the agent/chat surface | Med | TBD |
| 8 | R8 | Autopsy: why it died | Med | TBD |
| 9 | R11 | Hosted demo / replay | Med | TBD |
| 10 | R9 | Arbitrary GitHub URL + real clone & revive | Low | TBD |
| 11 | R10 | Sound & atmosphere | Low | TBD |

**Minimum demo-able product = R0–R5** (the vertical slice on one repo) **+ enough of R1/R4 to look like the art.**

## Time budget (Nov 1 – Dec 4, deadline unconfirmed, see Poltergeist KI-05)

| Week | Goal |
|---|---|
| 1 (Nov 1–7) | R0, R1 (renderer working on one image), pick + prepare the one demo repo (R2 groundwork) |
| 2 (Nov 8–14) | R2 (the raise + vitals), R3 (Poltergeist wired, findings coming back) |
| 3 (Nov 15–21) | R4 (attack scene), R5 (wounds + heal loop). **Vertical slice works** |
| 4 (Nov 22–28) | R6, R7, R8, R11 as time allows; polish the art |
| 5 (Nov 29 – Dec 4) | Freeze on Dec 1. Record the video, write-up, submit |

---

## HIGH

### R0: Scaffold · High · TBD
**Owns:** the app skeleton: Vite + React + TypeScript, a `<canvas>` test page, ESLint, a test runner, `npm run health` (typecheck + lint + test), `.github/workflows` CI, and a backend entry (a small Node/Express or Hono server) for running revive/attack commands.
**Not this feature:** any scene or art.
- **User story:** As the builder, I want one command that says the app is healthy, from day one.
- **Constraints:** TypeScript. Pin versions. Mirror Poltergeist's health-gate discipline (see the sibling's AGENTS.md).
- **Done when:** `npm run dev` serves a blank canvas page, and `npm run health` is green locally and in CI.

### R1: Dot-matrix renderer · High · TBD
**Owns:** the reusable renderer that turns an image (or a live frame) into dithered dots/glyphs on a canvas, per [THEME.md](THEME.md) §3: Bayer dither, brightness steps, empty-darkest, `pitch`, palette tokens.
**Not this feature:** the scenes that use it (R2, R4).
- **User story:** As every later scene, I need one renderer so the whole app shares the look.
- **User flow:** `drawDots(ctx, image, { pitch, palette })` and a glyph variant `drawGlyphs(...)`.
- **Constraints:** deterministic (same input → same dots). 30fps on an animated frame. Honour `prefers-reduced-motion`.
- **Done when:** a demo page renders a sample image as purple-on-void dots, a snapshot test pins the output, and switching `pitch` changes density. Put a picture of it in front of the team to approve the look.

### R2: The Raise · High · TBD
**Owns:** reviving **one prepared dead repo** (bundled in `fixtures/`), and proving it with deterministic **vitals** (install, build, serve, render), plus the raise scene (spell circle + heart monitor flatline → pulse). The backend runs the commands in a temp dir and streams status to the UI.
**Not this feature:** Death (R3/R4) · picking the repo (R6) · arbitrary URLs (R9).
- **User story:** As the necromancer, I raise a dead project and watch its heart start beating, for real.
- **User flow:**
  1. The one demo repo starts "dead" (fails to install/build/run on Node 22).
  2. The user starts the ritual.
  3. The backend applies the prepared fix (or runs an agent step) and runs vitals; the UI shows flatline → pulse as each vital passes.
  4. The revived app is served at a localhost origin and shown running.
- **Constraints:**
  - **Pick a small, permissively licensed demo repo** that genuinely fails on Node 22 and is quick to fix (KI-R1). Keep its "before" and "after" so the demo is reliable.
  - Vitals are real checks, not animations faked on a timer (STORY § Tone).
  - The revived app must end up served at a URL Poltergeist can point at (R3 needs this).
- **Done when:** on the demo machine, the demo repo goes from failing to served-and-rendering, and the pulse scene reflects the real vital results.

### R3: Death's attack (wire in Poltergeist) · High · TBD
**Owns:** calling the Poltergeist engine against the revived app and getting findings back: write a `poltergeist.config.json` pointing at the revived app's origin, provide/author a spec (the "chart") of the revived app, run Poltergeist (its CLI `summon` or MCP), and parse `haunting-report.json`.
**Not this feature:** drawing the attack (R4) · the engine itself (that's the sibling, already built).
- **User story:** As Death, I fall on the revived app and try to break it; whatever I break comes back as a list.
- **User flow:**
  1. Reanimator has a small Kiro spec describing what the revived app should do (the "chart"). For v1, hand-write it for the demo repo.
  2. Reanimator writes a Poltergeist config aimed at the revived app's origin (localhost only — Poltergeist refuses anything else).
  3. Reanimator runs Poltergeist; it compiles persona tests, runs them, and writes the report.
  4. Reanimator reads `haunting-report.json`: the haunted/clean criteria, the persona, the steps, the evidence.
- **Constraints:**
  - **Don't re-implement the attacks.** Shell out to the sibling engine or use its MCP. Read `../poltergeist/README.md` and its `docs/`.
  - Poltergeist only attacks localhost by design, so the revived app must be local. Good — it is (R2).
  - Each persona = one class of adversarial test (input-injection-style, race, impatient resubmit, stale session, slow device, keyboard-only), using the engine's existing safe mechanisms (vetted static inputs + generators; the model never writes payloads). This is QA/robustness testing of the app **you revived and own** — not an exploit tool (see Poltergeist D-08).
- **Done when:** running the full loop on the demo repo produces a real `haunting-report.json` with at least one reproduced finding.

### R4: The attack scene · High · TBD
**Owns:** the scene where Death and his six minions attack the running app: the app rendered as dots, minion sprites (`--death`) swarming it, and a wound opening where a finding lands (THEME §5–6).
**Not this feature:** getting the findings (R3) · the heal loop (R5).
- **User story:** As a viewer, I want to *see* Death break the app, so the demo is memorable.
- **User flow:** as Poltergeist streams progress (or when the report lands), minions appear over the app; each finding draws a red wound at its spot with a short label.
- **Constraints:**
  - Uses the R1 renderer.
  - Red (`--death`) only for Death and wounds; never purple.
  - If live streaming from the engine is hard, drive the scene from the finished report (still real data).
- **Done when:** a real run on the demo repo plays as an attack with at least one visible wound, good enough to film.

### R5: Wounds + heal loop · High · TBD
**Owns:** the findings list ("wounds on the chart"), triggering a Kiro fix for a finding, re-running Poltergeist on just that finding, and showing the wound close.
**Not this feature:** the attack visuals (R4) · the engine (sibling).
- **User story:** As the necromancer, I heal what Death broke and dare him to try again.
- **User flow:**
  1. Each finding is a wound with its reproduction steps.
  2. The user sends it to Kiro to fix (Kiro edits the revived repo).
  3. Reanimator re-runs Poltergeist on that finding (`--only <id>`).
  4. If it's now clean, the wound closes (THEME §6) and the chart line turns from red to healed.
- **Constraints:**
  - The re-run is real (Poltergeist's `rehaunt` / `--only`).
  - A wound only closes on a genuine pass.
- **Done when:** in the demo, one finding goes wound → healed after a real fix and re-run.

---

## MED

### R6: The graveyard (pick a repo) · Med · TBD
**Owns:** the opening scene: a graveyard of dead repos to choose from (a curated list in v1), Kiro walking out to fetch the chosen one.
- **User story:** As the necromancer, I choose which dead project to raise.
- **Constraints:** curated list of prepared repos in v1; no live GitHub search yet (that's R9).
- **Done when:** the user picks from the graveyard and it leads into the raise (R2).

### R7: The grimoire (agent surface) · Med · TBD
**Owns:** the spellbook-styled surface for talking to Kiro (THEME §8): prompts as spells, replies as quill writing, tool runs as margin notes, code changes as ruled boxes, context as a candle.
- **User story:** As the necromancer, I direct my familiar through the grimoire, not a chat box.
- **Constraints:** the text stays real text (not dots). Wire it to the actual agent used for healing (R5).
- **Done when:** a heal (R5) can be driven from the grimoire and reads like casting a spell.

### R8: Autopsy (why it died) · Med · TBD
**Owns:** showing *why* the repo was dead (the causes: a rotted dependency, a dead build tool), shown as the necromancer reading the body.
- **User story:** As a developer, I want to know what killed it and what was changed.
- **Constraints:** can be pre-written for the demo repo in v1, or generated by an agent step.
- **Done when:** the demo shows a believable cause of death tied to the real fix.

### R11: Hosted demo / replay · Med · TBD
**Owns:** a way for a judge to see it without installing: a recorded replay of a real run, or a hosted instance.
- **User story:** As a judge, I want to open a URL and see it work.
- **Constraints:** if hosting the live revive+attack is too heavy, ship a recorded replay (clearly labelled), like Poltergeist's F15.
- **Done when:** a public URL shows the hero run end to end.

---

## LOW

### R9: Arbitrary GitHub URL + real clone & revive · Low · TBD
**Owns:** accepting any dead-JS-repo URL, cloning it, and attempting a real revive (not just the prepared one).
- **Constraints:** sandbox the clone and the install (untrusted code). This is the hardest part of the original Reanimator; treat as a stretch goal.
- **Done when:** at least one *unprepared* permissively licensed repo revives end to end.

### R10: Sound & atmosphere · Low · TBD
**Owns:** heartbeat, the cast, Death's arrival; idle fog drift; all off by default (THEME §9).
- **Done when:** the video has sound and the scenes have subtle motion, with a mute toggle.

---

## SCRAPPED / explicitly out of scope for v1

- **Full Docker "operating room" per revive** (the original Reanimator's isolation model): too heavy for a vibe-coded build. Use a temp-dir sandbox for the prepared repo; revisit for R9.
- **Framework migrations** (AngularJS→Angular etc.): never. Revive faithfully, like the original.
- **Auto-opening PRs on third-party repos:** never. Produce a branch/patch/PR text for a human (STORY close).
- **Turning Poltergeist into an exploit/security-attack generator:** no. It stays QA/robustness testing of your own revived app (Poltergeist D-08).

## Changelog
- 2026-11-01: PRD created for the merged entry. Reanimator is the product; Poltergeist is its red-team engine (Death). Frankenstein category.
