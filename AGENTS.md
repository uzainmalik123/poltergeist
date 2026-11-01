# AGENTS.md — repo root (read this first)

This repository is the team's **Kiroween 2026** entry. It holds **two sibling projects**:

```
<repo root>/
  reanimator/    THE PRODUCT we submit (Frankenstein): a necromancer raises dead repos;
                 Death attacks what you revived; you heal it. All the UI, art and story.
  poltergeist/   THE ENGINE (headless): the red-team that powers "Death's attack".
                 Already built and tested. Reanimator calls it.
  .github/       CI (runs Poltergeist's health gate inside poltergeist/)
  .claude/       repo-wide skills: superpowers + grill-me/grilling
```

## Which project am I working on?

- **Work in `reanimator/`** for anything the user sees: the story, the art, the raise, Death's attack scene, the heal loop. Start with `reanimator/AGENTS.md`.
- **Work in `poltergeist/`** only for the engine itself (compiling/running the adversarial tests). Start with `poltergeist/AGENTS.md`.
- Each project has its own `docs/`, `.kiro/`, `AGENTS.md` and `CLAUDE.md`. When a session opens inside a subfolder, that subfolder's guide applies; this root file is the map.

## How they fit (the mash-up)

Reanimator revives a dead repo and serves it on localhost. Then it runs **Poltergeist** against that revived app (via Poltergeist's CLI/MCP) and draws the findings as "wounds" Death inflicted. The user heals them with Kiro and re-runs. See `reanimator/docs/STORY.md` and `reanimator/docs/PRD.md` (the mash-up diagram).

- **Submission:** one entry, **Reanimator**, in **Frankenstein**. Poltergeist is a component, not a separate submission (Poltergeist `docs/DECISIONS.md` D-39).
- **The look:** the necromancer dot-matrix style (`reanimator/docs/THEME.md`). Poltergeist is headless here; its own Séance/costume are deprioritised.

## Rules that apply across the whole repo

- **Fresh code only.** Nothing is copied from `../reanimator` (the earlier prototype) or `../poltergeist-old` — both predate the hacking window and are off-limits. Every line here is written inside the window (eligibility).
- **`npm run health` stays green** in each project after every change. CI runs it.
- **Keep each project's `docs/DECISIONS.md` and `docs/KNOWN_ISSUES.md` current** every session (each AGENTS.md says how).
- **Don't point the red-team at anything but the local app we revived.** It's QA/robustness testing of our own code (`poltergeist/docs/DECISIONS.md` D-08).

## Tools

- `hackathon-ai-strategist` subagent (strategy, scope, pitch).
- Repo-wide skills: `superpowers` (grill → plan → implement → review) and `grill-me` / `grilling`.

## State (2026-11-01)

- `poltergeist/`: engine built through **F11** (spec reader, config/safety, scout, personas, compiler, runner, verdicts, report, CLI, MCP server); tests green. Now consumed by Reanimator; its standalone Séance (F12) / Costume (F26) are deprioritised (D-39).
- `reanimator/`: docs only; the app is built from `reanimator/docs/PRD.md`, starting at R0.
