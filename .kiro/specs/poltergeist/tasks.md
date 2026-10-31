# Implementation Plan

Work happens one PRD feature at a time, through the grill → plan → implement → review cycle in `AGENTS.md`. Each feature's detailed task plan is written to `docs/plans/` when that feature is planned. This list is the order. Tick a box only when the feature's "Done when" in `docs/PRD.md` passes and `npm run health` is green.

- [x] 0. Scaffold the monorepo, the health gate and CI (D-19)
  - npm workspaces, TypeScript, ESLint, Vitest, `npm run health`, `.github/workflows/ci.yml`
  - _Requirements: none (infrastructure)_
- [x] 1. F01 Spec Reader
  - _Requirements: 1.1–1.8_
- [ ] 2. F02 Target Config & Safety
  - _Requirements: 2.1–2.8_
- [ ] 3. F10 Candy Swap Demo Target (built in Kiro from its own spec)
  - _Requirements: none in this spec (it has its own)_
- [ ] 4. F03 Route Scout (tested against Candy Swap directly)
  - _Requirements: 3.1–3.7_
- [ ] 5. F04 Core Personas & Input Generators
  - _Requirements: 4.1, 4.2_
- [ ] 6. KI-01 spike: compile and run 5 criteria × 3 personas against Candy Swap
  - _Requirements: 5.1–5.6 (spike only)_
- [ ] 7. F05 Ghost Compiler
  - _Requirements: 5.1–5.6_
- [ ] 8. F06 Ghost Runner
  - _Requirements: 6.1–6.8, 2.5, 2.7_
- [ ] 9. F07 Verdicts & Flake Filter
  - _Requirements: 7.1–7.4_
- [ ] 10. F08 Haunting Report
  - _Requirements: 8.1–8.3_
- [ ] 11. F26 Costume Kit
  - _Requirements: 12.1–12.6_
- [ ] 12. F09 CLI `summon`
  - _Requirements: 9.1, 9.2_
- [ ] 13. F11 Kiro MCP Server
  - _Requirements: 10.1, 10.2_
- [ ] 14. F12 Séance Room (Live)
  - _Requirements: 11.1–11.3_
- [ ] 15. Med features in PRD order (F13–F18), then Low (F19–F22)
