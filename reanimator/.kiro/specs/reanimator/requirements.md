# Requirements Document

## Introduction

Reanimator is a necromancer's workbench for dead code. You pick a dead repository from the graveyard, raise it so it runs again on a modern toolchain, and then **Death** comes to break what you revived. Death's attack is the [Poltergeist](../../../poltergeist/README.md) engine run against the revived app: it finds real flaws. You read Death's findings as wounds and heal them with Kiro, your familiar, until the project survives him.

The whole thing is dressed in a dot-matrix / glyph art style (see `docs/THEME.md`) and told as a story (see `docs/STORY.md`). This file is the source of truth for *what must be true*. Scope and priorities are in `docs/PRD.md`.

Criterion IDs follow Kiro's `N.M` convention. **Death's attack is QA/robustness testing of a repo the user owns and just revived, on localhost only** — not an exploit tool (see Poltergeist's `docs/DECISIONS.md` D-08).

## Glossary

- **Patient / body:** the dead repository being revived.
- **Raise:** reviving the patient on a modern toolchain, proven by deterministic **vitals** (install, build, serve, render).
- **Pulse:** vitals passing; shown as a heart monitor going from flatline to beating.
- **Death:** the antagonist; concretely, the Poltergeist red-team engine.
- **Minion:** one Poltergeist persona (a class of adversarial test).
- **Wound:** one reproduced finding from Death's attack.
- **Heal:** fixing a finding with Kiro and re-running the attack until it passes.
- **Chart:** a small spec of the revived app that Poltergeist tests against.
- **Familiar:** Kiro, the agent that searches, operates and heals on your command.

## Requirements

### Requirement 1: Raise a dead repo

**User Story:** As a necromancer, I want to raise a dead project and see its heart start beating, so that I have a living app to defend.

#### Acceptance Criteria

1. WHEN the user starts the ritual on the demo repo, THE Reanimator SHALL run the deterministic vitals (install, build, serve, render) and SHALL serve the revived app at a localhost origin.
2. THE Reanimator SHALL show the heart monitor move from flatline to a pulse as each vital passes, reflecting the real vital results.
3. IF a vital fails, THEN THE Reanimator SHALL show the pulse stall at that step and report which vital failed.
4. THE Reanimator SHALL NOT fake a pulse: the monitor beats only when vitals actually pass.

### Requirement 2: Death attacks the revived app

**User Story:** As a viewer, I want Death to fall on the revived app and try to break it, so that the demo has stakes.

#### Acceptance Criteria

1. WHEN the app is revived and served, THE Reanimator SHALL run the Poltergeist engine against the revived app's origin, using a chart of the app, and SHALL collect the findings.
2. THE Reanimator SHALL only ever attack the local revived app, never any third-party host (Poltergeist refuses non-loopback targets).
3. THE Reanimator SHALL represent each Poltergeist persona as one of Death's minions, each a class of adversarial test.
4. THE Reanimator SHALL draw the attack in the dot-matrix style: Death and his minions over the running app, with a wound where each finding lands.

### Requirement 3: Wounds and healing

**User Story:** As a necromancer, I want to heal what Death broke and dare him to try again, so that the project survives him.

#### Acceptance Criteria

1. WHEN the attack finishes, THE Reanimator SHALL list each finding as a wound with its reproduction steps and evidence.
2. WHEN the user heals a wound, THE Reanimator SHALL have Kiro fix the finding in the revived repo and SHALL re-run the attack for that finding only.
3. IF the re-run passes, THEN THE Reanimator SHALL close the wound and mark it healed; a wound SHALL close only on a genuine pass.
4. THE Reanimator SHALL produce a branch, a patch and a PR description for the revived-and-hardened repo, and SHALL NOT open a pull request on a third-party repo on its own.

### Requirement 4: The look

**User Story:** As a judge, I want Reanimator to look like a necromancer's dot-matrix vision, so that it is memorable and clearly made for Kiroween.

#### Acceptance Criteria

1. THE Reanimator SHALL render its scenes as Bayer-dithered dots or glyphs on a dark background, deterministically for the same input (`docs/THEME.md`).
2. THE Reanimator SHALL use the magic colour for the user's necromancy only and the death colour for Death and wounds only, never mixing them.
3. THE Reanimator SHALL keep all real text (findings, code, numbers) as real, selectable text and SHALL only turn imagery into dots or glyphs.
4. WHERE the viewer prefers reduced motion, THE Reanimator SHALL replace animation with instant state changes.

### Requirement 5: The graveyard and the familiar

**User Story:** As a necromancer, I want to choose a body and command my familiar, so that the ritual feels like mine.

#### Acceptance Criteria

1. THE Reanimator SHALL let the user choose a dead repo from a curated graveyard (one or more prepared repos in v1).
2. THE Reanimator SHALL let the user direct Kiro (the familiar) to perform the healing, through the grimoire surface.
3. WHERE a repo lacks an OSI-approved licence, THE Reanimator SHALL mark it and SHALL say it must not be published.
