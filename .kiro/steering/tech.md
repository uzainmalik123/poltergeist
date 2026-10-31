# Tech

- TypeScript on Node ≥ 22, ESM, npm workspaces. `tsx`, `vitest`, `eslint` + `typescript-eslint`.
- Playwright (`playwright-core`, Chromium), zod, unified + remark-parse, fast-check, `@anthropic-ai/sdk`, `@modelcontextprotocol/sdk`, ws.
- Séance Room: Vite + React + Tailwind. Costume Kit: plain TS + canvas, no dependencies.
- Demo target: Hono + better-sqlite3.
- Versions are pinned exactly (no `^`) and listed in `docs/STACK.md`.
- `npm run health` (typecheck + lint + tests) must be green after every change, and CI runs the same command (D-19).
- Secrets come from Doppler or `.env`, are referenced as `env:NAME` and are never committed.
