# Design Document

> How Reanimator fits together. *What* must be true is in `requirements.md`; scope in `docs/PRD.md`; the look in `docs/THEME.md`; the narrative in `docs/STORY.md`; rulings in `docs/DECISIONS.md`.

## 1. Architecture

```
  React UI (Vite) ── the necromancer's world, all dot-matrix scenes ──┐
    graveyard · raise · attack · grimoire                             │ HTTP + WebSocket
                                                                      ▼
  Node backend (Hono)
    ├─ revive(repo)   : run install/build/serve/render in a temp dir → vitals, serve at localhost:<port>
    ├─ attack(origin) : run Poltergeist against the revived app → haunting-report.json
    ├─ heal(finding)  : ask Kiro to fix it in the revived repo
    └─ recheck(id)    : re-run Poltergeist --only <id>
                                                                      │ CLI / MCP
                                                                      ▼
  Poltergeist engine (../poltergeist, headless, already built)
    reads a chart (spec) of the revived app, runs persona attacks, writes a report

  Dot-matrix renderer (shared, Canvas 2D) ─ draws every scene from images/frames
```

- **Reanimator owns the story, art and flow. Poltergeist owns the attacks.** Reanimator calls Poltergeist; it never re-implements it (D-R4).
- **The renderer is the one shared art primitive** (THEME §3). Every scene is an image (or live frame) fed through it.
- **Everything the engine does is real** (D-R11): vitals, findings and fixes are not simulated.

## 2. The revive (R2)

- v1 operates on **one prepared repo** in `fixtures/` (D-R6) that genuinely fails on Node 22.
- `revive()` copies it to a temp dir, applies the prepared toolchain fix (or runs a Kiro step), and runs **vitals**: `install` (npm installs clean), `build` (exits 0, or none), `serve` (HTTP up), `render` (loads in headless Chromium with no uncaught errors). Each vital result streams to the UI as a heartbeat step.
- The revived app is served at `http://localhost:<port>` so Poltergeist can reach it (D-R7).

## 3. Death's attack (R3, R4)

- `attack(origin)`:
  1. ensure a **chart** exists: a small Kiro spec (`requirements.md`) describing the revived app (hand-written for the demo repo in v1, D-R8).
  2. write a `poltergeist.config.json` whose `target` is the revived app's localhost origin, with the personas enabled.
  3. run Poltergeist (CLI `summon` or MCP — decided in R3, KI-R4) and read `haunting-report.json`.
- The UI draws the attack from that run: minions (personas) over the dithered app, a wound per finding (THEME §6). If live streaming is hard, drive the scene from the finished report — still real data.

## 4. Wounds and healing (R5)

- Each finding → a wound: promise, persona, steps, expected vs actual, evidence.
- `heal(finding)` hands the finding to Kiro, which edits the revived repo.
- `recheck(id)` runs Poltergeist `--only <id>`; on a pass the wound closes (D-R11). On all-clean, Reanimator emits the branch/patch/PR text (D-R10).

## 5. The renderer (R1, the art)

- `drawDots(ctx, image, {pitch, palette})` and `drawGlyphs(...)` per THEME §3 and §7: Bayer 4×4 ordered dither, a few brightness steps, darkest = empty, deterministic.
- Luminance computed on a downscaled copy; per-cell cache; only changed cells redrawn (KI-R3).
- Palette tokens from THEME §4: `--magic` for the user's necromancy only, `--death` for Death and wounds only.

## 6. Scenes (React components, each using the renderer)

| Scene | Feature | Essential? |
|---|---|---|
| Graveyard (pick a repo) | R6 | Med |
| The Raise (circle + heart monitor) | R2 | **Yes** |
| Death's attack (minions + wounds) | R4 | **Yes** |
| The grimoire (agent/chat, report, heal) | R7 | Med |

Scene changes are a fade to black and back (eyes closing/opening).

## 7. Suggested layout

```
reanimator/
  src/
    render/        the dot-matrix renderer (R1)
    scenes/        graveyard, raise, attack, grimoire
    engine/        client for the backend (revive, attack, heal, recheck)
  server/          Node backend (Hono): revive, attack, heal, recheck
  fixtures/        the prepared demo repo (before/after) + its chart
  charts/          hand-written Poltergeist specs for demo repos
  docs/            STORY, THEME, PRD, DECISIONS, KNOWN_ISSUES, STACK, plans/
  .kiro/           this spec + steering
```

## 8. Open wiring questions (settle while building)

- **How to call Poltergeist** (KI-R4): CLI vs MCP vs importing its core. Read `../../poltergeist/README.md` and `../../poltergeist/docs/` first. CLI + read the JSON report is likely simplest.
- **The chart** (KI-R5): hand-write for the demo repo now; generate with an agent later.
- **Live vs recorded demo** (KI-R7): recorded replay is the safe primary artifact.
