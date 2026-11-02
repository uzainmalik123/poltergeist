# Implementation Plan

Work happens one PRD feature at a time, through the grill → plan → implement → review cycle in `AGENTS.md`. Each feature's detailed task plan is written to `docs/plans/` when that feature is planned. This list is the order. Tick a box only when the feature's "Done when" in `docs/PRD.md` passes and `npm run health` is green.

- [x] 0. Scaffold the monorepo, the health gate and CI (D-19)
  - npm workspaces, TypeScript, ESLint, Vitest, `npm run health`, `.github/workflows/ci.yml`
  - _Requirements: none (infrastructure)_
- [x] 1. F01 Spec Reader
  - _Requirements: 1.1–1.8_
- [x] 2. F02 Target Config & Safety
  - _Requirements: 2.1–2.8_
- [ ] 3. F10 Candy Swap Demo Target (built in Kiro from its own spec; prep kit done, D-37: brief, config, `npm run candy:check`; Kiro build pending, KI-44)
  - _Requirements: none in this spec (it has its own)_
- [x] 4. F03 Route Scout (built against a Candy-shaped fixture, D-30; rerun against Candy Swap when F10 lands, KI-30)
  - _Requirements: 3.1–3.7_
- [x] 5. F04 Core Personas & Input Generators
  - _Requirements: 4.1, 4.2_
- [ ] 6. KI-01 spike: compile and run 5 criteria × 3 personas against Candy Swap
  - _Requirements: 5.1–5.6 (spike only)_
- [x] 7. F05 Ghost Compiler (fixture; live Candy Swap check pending, KI-34; built before the spike, D-32)
  - _Requirements: 5.1–5.6_
- [x] 8. F06 Ghost Runner (fixture; real Candy Swap check pending, KI-36; built before F10, D-33)
  - _Requirements: 6.1–6.8, 2.5, 2.7_
- [x] 9. F07 Verdicts & Flake Filter (D-34)
  - _Requirements: 7.1–7.4_
- [x] 10. F08 Haunting Report (fixture; Kiro + real Candy Swap check pending, KI-38, D-35)
  - _Requirements: 8.1–8.3_
- [ ] 11. F26 Costume Kit
  - _Requirements: 12.1–12.6_
- [x] 12. F09 CLI `summon` (fixture; real Candy Swap check pending, KI-42, D-36)
  - _Requirements: 9.1, 9.2_
- [x] 13. F11 Kiro MCP Server (fixture; real Kiro + Candy Swap check pending, KI-46, D-38)
  - _Requirements: 10.1, 10.2_
- [x] 14. F12 Live Feed (headless, D-40; Candy Swap check KI-49)
  - _Requirements: 11.1–11.3_
- [ ] 15. Med features in PRD order (F13–F18), then Low (F19–F22)
