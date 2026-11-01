# AGENTS.md — Reanimator (read this first, every session)

**You are helping build Reanimator with someone who is vibe-coding.** They know what they want it to *feel* like, not how it's built. Your job is to hold their hand: explain choices in plain terms, propose the next concrete step, write the code, keep it healthy, and never leave them stuck. Default to doing the work and showing the result, not handing back a list of things for them to do.

> New here? Read, in order: `docs/STORY.md` (what it is), `docs/THEME.md` (how it looks), `docs/PRD.md` (what to build next). This file ties them together.

## What we're building

**Reanimator**: you play a necromancer who raises dead GitHub repos. Then **Death** comes to break what you revived, and you heal the damage. It's our Kiroween 2026 entry, in **Frankenstein** (it stitches two systems together).

- **Half one — the raise:** take a dead repo (won't install/build/run on Node 22) and bring it back, proven by real checks (vitals), with a heart monitor going flatline → pulse.
- **Half two — Death's attack:** Death and his minions fall on the revived app and try to break it. This is the **Poltergeist** engine (our sibling project at `../poltergeist`) run against the app you just revived. Whatever it breaks is a real flaw.
- **The heal:** you read what Death broke (the "wounds") and fix them with **Kiro, your familiar**, until the project survives him.

The full picture is in `docs/STORY.md`. The art is in `docs/THEME.md`.

## How this repo is laid out

This repo holds **two sibling projects**:

```
<repo root>/
  poltergeist/   the red-team ENGINE (already built, headless). Death's attack = this.
  reanimator/    THIS project: the app, the art, the story. You work here.
  AGENTS.md      the root guide (how the two fit together)
```

- **You work in `reanimator/`.** You *use* `../poltergeist` as a tool; you do not change it unless the user explicitly asks.
- Poltergeist is already built and tested. Read `../poltergeist/README.md` and `../poltergeist/docs/` when you need to call it (that's feature R3).

## Hard rules (don't break these)

1. **Fresh code only.** Do **not** copy, port, or read-then-reproduce files from `../../reanimator` (the earlier prototype, outside this repo) or `../../poltergeist-old`. Both were started before the hackathon and are off-limits (`docs/DECISIONS.md` D-R2). We rebuild the *technique* from `docs/THEME.md`, not their files. This keeps every line eligible (KI-R6).
2. **One look.** The necromancer dot-matrix style in `docs/THEME.md` is THE look. `--magic` (purple) is for the user's necromancy only; `--death` (red) is for Death and wounds only. Never mix them. Poltergeist's old green "haunted terminal" look is **not** used here (D-R4).
3. **Don't re-implement Poltergeist.** Death's attack is the sibling engine, called via its CLI or MCP (D-R4, KI-R4). If you're writing persona/attack logic in `reanimator/`, stop — that already exists next door.
4. **Nothing faked for the camera** (D-R11). A pulse means real vitals passed. A wound means a real finding reproduced. A healed wound means a real fix plus a real re-run. If you're tempted to animate a result on a timer with no real check behind it, don't — ask the user instead.
5. **Death only attacks the local app we revived.** Poltergeist refuses non-localhost targets by design. We never point it at anyone else's site. This is QA/robustness testing of a repo the user owns (`../poltergeist/docs/DECISIONS.md` D-08). It is not an exploit tool and we don't make it one.
6. **Humans open PRs** (D-R10). We output a branch, a patch and a PR description; a person decides whether to send it. No auto-PRs on third-party repos.

## The art, step by step (this is the costume — it matters)

The look is worth a lot of the score, and the original artist is gone, so **you** rebuild it. Good news: once the renderer exists, it does most of the work. Follow this order and you won't get stuck.

1. **Build the renderer first (feature R1).** It turns any image into dithered dots on a canvas. The full algorithm is in `docs/THEME.md` §3 (Bayer 4×4 ordered dither, a few brightness steps, darkest cell = empty, deterministic). Build it as `drawDots(ctx, image, {pitch, palette})` plus a glyph variant `drawGlyphs(...)`.
2. **Prove it on one image the team likes.** Feed it a single hero image, render it in purple-on-black dots, and show the user a screenshot. Iterate `pitch` and brightness steps until they're happy. **Do this before building any scene** (KI-R2).
3. **Make source art the easy way.** You don't need to be an artist — the ditherer stylises anything:
   - start from a plain silhouette, an openly licensed image the user picks, or something the user generates;
   - keep sources simple and high-contrast (the dither loves contrast);
   - never use the earlier prototype's images/models/sound (rule 1). Make or source our own, and note each asset's licence.
4. **Then build scenes** (R2 raise, R4 attack) by feeding the renderer the right image per state. Scenes are just images + the renderer + a bit of motion.
5. **Keep real text as real text.** Findings, code, numbers and the grimoire's writing are selectable text, never dots (THEME §7–8).
6. **Respect `prefers-reduced-motion`** and give every scene an `aria-label` (THEME §9).

The palette, the scene list, the minion sprites and the grimoire-as-chat metaphor are all specced in `docs/THEME.md`. When in doubt, show the user a screenshot and ask.

## The build order (don't skip ahead)

Follow `docs/PRD.md`. The short version:

1. **R0** scaffold → **R1** renderer → pick the demo repo (KI-R1) → **R2** the raise → **R3** wire in Poltergeist → **R4** attack scene → **R5** heal loop. That's the **vertical slice**: get it working end to end on ONE repo before adding more scenes (graveyard R6, grimoire R7) or more repos (R9).
2. A working slice beats four half-built scenes. The video needs the raise and the attack most.

## The work cycle (same as the sibling)

Each feature goes: **grill → plan → implement → review**. The skills are installed repo-wide.

1. **Grill** — `/grill-me R2` (or whichever feature): the agent asks questions one at a time with a recommended answer, until the plan is clear. Great for a vibe-coder — answer in plain words.
2. **Plan** — `/superpowers:writing-plans`: writes a step-by-step plan into `docs/plans/`.
3. **Implement** — `/superpowers:executing-plans` (small) or `/superpowers:subagent-driven-development` (bigger).
4. **Review** — `/superpowers:requesting-code-review`, then `/code-review`.
5. **Close** — run the feature's "Done when" and `npm run health`; tick it in `docs/PRD.md` and `.kiro/specs/reanimator/tasks.md`; update `docs/DECISIONS.md` / `docs/KNOWN_ISSUES.md`.

If the user just says "build X", you can do the cycle for them and narrate it in plain language — don't make them learn the commands.

## Keep the docs current (every session)

Before you hand back, if anything changed:
- **`docs/KNOWN_ISSUES.md`** — add new risks (`KI-Rxx`), update statuses, never delete.
- **`docs/DECISIONS.md`** — add choices future sessions must respect (`D-Rxx`); supersede, don't rewrite.
- **`.kiro/specs/reanimator/`** — if a decision changes *what must be true*, update the spec.
- **`docs/PRD.md`** and **`tasks.md`** — status, and a changelog line.
- If nothing changed, say "docs: no changes."

## Health check (after every implementation)

Run **`npm run health`** (typecheck + lint + test) before reporting back, committing, or handing off. It must be green. Don't weaken tests to pass it. Quote the result. CI runs the same.

## How to call Poltergeist (feature R3)

Death's attack is the sibling engine. When you reach R3:
- Read `../poltergeist/README.md` and `../poltergeist/docs/` (PRD, DECISIONS) first.
- The app Reanimator revives must be served on **localhost** (Poltergeist only attacks localhost).
- Poltergeist tests against a **spec** of the app (a "chart"). For the demo repo, hand-write a small one (D-R8, KI-R5).
- Run Poltergeist (its CLI `summon` or MCP — pick the simplest, KI-R4), then read `haunting-report.json` and draw each finding as a wound.
- Re-check a fixed finding with Poltergeist's `--only <id>` / `rehaunt`.

## Stack (details in `docs/STACK.md`)

- TypeScript, Vite + React, Canvas 2D for the renderer, a small Node (Hono) backend for revive + attack. Kiro is the agent that heals. Pin versions.

## Hackathon context

- **Entry:** Reanimator, **Frankenstein** category. Costume is a strong secondary angle (the art).
- **Kiro is central** (the familiar): it searches, operates and heals. Make that visible — it's judged.
- **Eligibility (KI-R6):** fresh repo, fresh code, first commit inside the window. In the write-up, say plainly the idea was prototyped before the event and rebuilt from scratch during it. Confirm the 2026 "new project" rules (Poltergeist `docs/KNOWN_ISSUES.md` KI-05).
- **Submission needs:** public repo + OSI licence + committed `.kiro/`, a working app URL (a recorded replay is fine, R11), a < 3-min public video, and a write-up of how Kiro was used.

## Do first (as of 2026-11-01)

1. Read `docs/STORY.md`, `docs/THEME.md`, `docs/PRD.md`.
2. **R0** scaffold, then **R1** renderer, and get one hero image rendering in the dot style the user likes (KI-R2).
3. Shortlist and pick the one demo repo (KI-R1).
4. Read the 2026 rules (KI-R6 / Poltergeist KI-05).

## Tools available

- `hackathon-ai-strategist` subagent (ideation, scope triage, pitch/demo planning).
- Repo-wide skills: `superpowers` (plan/implement/review) and `grill-me` / `grilling`.
