# Structure

```
packages/core       spec · config · safety · scout · personas · compiler · runner · verdicts · report · events
packages/costume    glyph renderer, sprites, wordmark, palette
packages/cli        poltergeist binary
packages/mcp        MCP stdio server
packages/seance     Séance Room (Vite + React)
integrations/kiro   templates installed into OTHER projects' .kiro/ (hook, steering, MCP, Power)
fixtures/candy-swap demo target app with its own .kiro/specs/candy-swap/
docs/               PRD, DECISIONS, KNOWN_ISSUES, STACK, THEME, LESSONS, plans/
.kiro/              this project's own Kiro spec and steering (commit it, never gitignore it)
```

- Tests live next to their package in `test/`, mirroring `src/`.
- Each module exports through its folder's `index.ts`, and the package exports through `src/index.ts`.
- One feature per branch or cycle, named by PRD ID (`F05: …` in commit messages).
