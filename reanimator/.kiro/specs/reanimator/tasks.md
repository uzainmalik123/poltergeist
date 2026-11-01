# Implementation Plan

Work one PRD feature at a time, through the grill → plan → implement → review cycle in `../../AGENTS.md`. Tick a box only when the feature's "Done when" in `docs/PRD.md` passes and `npm run health` is green. Build the vertical slice (0–5) on ONE repo before widening.

- [ ] 0. R0 Scaffold (Vite + React + TS, canvas page, health gate, CI, backend entry)
  - _Requirements: none (infrastructure)_
- [ ] 1. R1 Dot-matrix renderer (the art engine)
  - _Requirements: 4.1, 4.3, 4.4_
- [ ] 2. Choose + prepare the one demo repo (KI-R1), keep before/after in fixtures/
  - _Requirements: 1 (groundwork)_
- [ ] 3. R2 The Raise: revive the demo repo, real vitals, pulse scene
  - _Requirements: 1.1–1.4_
- [ ] 4. R3 Death's attack: wire in Poltergeist, get findings
  - _Requirements: 2.1, 2.2, 2.3_
- [ ] 5. R4 The attack scene: Death + minions + wounds over the app
  - _Requirements: 2.4, 4.2_
- [ ] 6. R5 Wounds + heal loop (Kiro fix, re-run, close wound, PR text)
  - _Requirements: 3.1–3.4_
- [ ] 7. R6 Graveyard (pick a repo)
  - _Requirements: 5.1, 5.3_
- [ ] 8. R7 Grimoire (agent surface)
  - _Requirements: 5.2_
- [ ] 9. R8 Autopsy; R11 hosted replay; then Low (R9, R10)
  - _Requirements: as per PRD_
