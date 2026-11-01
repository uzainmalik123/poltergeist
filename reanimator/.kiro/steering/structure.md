# Structure

```
src/render/     the dot-matrix renderer (shared art primitive)
src/scenes/     graveyard · raise · attack · grimoire
src/engine/     client for the backend
server/         Node backend: revive, attack, heal, recheck
fixtures/       the prepared demo repo (before/after)
charts/         hand-written Poltergeist specs for demo repos
docs/           STORY, THEME, PRD, DECISIONS, KNOWN_ISSUES, STACK, plans/
.kiro/          this project's spec + steering (commit it, never gitignore it)
```

- Build the vertical slice (R0–R5) on one repo before widening.
- Tests live beside their code. One feature per branch, named by PRD id (`R3: ...`).
