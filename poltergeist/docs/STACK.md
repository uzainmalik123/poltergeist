# Poltergeist: Stack

> Last updated: 2026-10-31. Versions are pinned exactly (no `^`) when installed, and recorded in the table at the bottom.

## Summary

| Layer | Choice | Why |
|---|---|---|
| Language / runtime | **TypeScript 5.9 on Node ≥ 22**, ESM | Same as Reanimator. Playwright and the MCP SDK are TypeScript-first |
| Repo | **npm workspaces** monorepo (`packages/*`). Candy Swap in `fixtures/candy-swap` is standalone (`npm --prefix`, D-37) | One engine, several front doors (CLI, MCP, Séance), one shared costume |
| Dev tooling | `tsx`, `vitest`, `eslint` + `typescript-eslint` | Same as Reanimator |
| Health gate | `npm run health` = typecheck + lint + tests, also run in CI (D-19) | One definition of "green" |
| Browser automation | **`playwright-core`** + Chromium (`npx playwright-core install chromium`) | Isolated contexts per actor, `page.route` for holding requests, a per-context proxy for the guard, CDP for throttling and frames, traces |
| Schema / validation | **zod 4** (+ zod → JSON Schema for structured output) | One definition of config and DSL for validation, types and the LLM contract |
| Spec parsing | `unified` + `remark-parse` + `mdast-util-to-string` | A robust walk over Kiro's markdown. EARS keyword rules are our own (D-16) |
| Input generators | **fast-check** (fixed seeds) + vendored **Big List of Naughty Strings** (MIT) | Deterministic inputs, and the LLM never writes payloads (D-04) |
| LLM | **Anthropic Claude via `@anthropic-ai/sdk`**. Default compiler model `claude-sonnet-5-5`, configurable | Strong at structured output. Only called at compile time |
| MCP server | `@modelcontextprotocol/sdk`, stdio | Kiro and Claude Code both speak MCP over stdio |
| Event transport | `ws` inside the runner (`:6660`) | Live and replay use one event format |
| **Costume Kit** | `@poltergeist/costume`: plain TS + Canvas 2D (`OffscreenCanvas`, glyph atlas), no runtime dependencies | Used by the CLI (sprites and wordmark as text), the report and the Séance (D-24, D-26) |
| Font | **JetBrains Mono** (Google Fonts, OFL) | Good box-drawing glyphs for the wordmark and frames |
| Séance Room UI | **Vite + React + TypeScript**, Tailwind CSS using the costume tokens | A static build for live and replay. No SSR needed |
| Demo target (Candy Swap) | **Hono** (server-side JSX) + **better-sqlite3**, generated and built in **Kiro** | Tiny, fast reset, and realistic enough for real race and validation bugs |
| Secrets | **Doppler** (`doppler run -- …`), `.env.example` fallback | Same workflow as Reanimator |
| CI | GitHub Actions on Node 22: `npm ci`, `npx playwright-core install --with-deps chromium`, `npm run health` | Same command as local. No secrets on PRs |

## SaaS used

| Service | Used for | Required? | Notes |
|---|---|---|---|
| **Anthropic API** | Ghost Compiler (F05), KI-01 spike | **Yes** | Plan caching limits spend. Set a console spend limit |
| **GitHub** | Public repo (hackathon requirement), Actions CI | **Yes** | MIT licence, `.kiro/` committed |
| **Doppler** | Secrets (`ANTHROPIC_API_KEY`, test-account password) | Yes (team convention) | `.env` fallback documented |
| **Kiro** (Pro+ during the event) | Building Candy Swap from its spec, and as the IDE Poltergeist integrates with (MCP, hooks, steering, Powers) | **Yes** | Integration, not just "the IDE we coded in" (D-01) |
| **Google Fonts** | JetBrains Mono for the Séance and replay site | Yes | Self-host it in the replay bundle if offline use matters |
| **Vercel** | Static replay site (F15) | Med | Static only, free tier. D-12 is still `Proposed` |
| **YouTube** | Demo video (< 3 min, public) | **Yes** | Upload at 1440p or 4K for glyph sharpness (KI-26) |
| **Devpost** | Submission | **Yes** | n/a |
| **Fly.io** | Hosted live sandbox (F21) | Low / optional | Only if F21 is built |

No database SaaS: Candy Swap uses local SQLite, and Poltergeist stores everything in its run folder.

## AWS

- **Planned: Amazon Bedrock as an optional LLM provider (F19, Low).** It runs the same Claude models through `@aws-sdk/client-bedrock-runtime`. It isn't on the critical path.
- **Not used:** Lambda, ECS and the like. Playwright plus Chromium is a poor fit for serverless.
- **Option (D-12, still open):** host the static replay on AWS Amplify Hosting or S3 + CloudFront instead of Vercel, for an AWS story. It's the same static `dist/`, so no code changes.

## Ports

| Port | Service |
|---|---|
| 4000 | Candy Swap (demo target) |
| 6660 | Runner event WebSocket |
| 6661 | Séance Room dev server |

## Packages

| Package | Depends on |
|---|---|
| `@poltergeist/core` | playwright-core, zod, unified, remark-parse, mdast-util-to-string, fast-check, @anthropic-ai/sdk, ws |
| `@poltergeist/costume` | none at runtime |
| `@poltergeist/cli` | core, playwright-core, ws, tsx (runs the bin from source, D-36); costume once F26 lands |
| `@poltergeist/mcp` | core, @modelcontextprotocol/sdk, zod, playwright-core, tsx (runs the bin from source, D-38) |
| `@poltergeist/seance` | react, vite, tailwind, costume (event types from core) |
| `candy-swap` (fixture) | hono, better-sqlite3 |

## Pinned versions

The prototype (2026-10-30) installed and verified these versions. Reuse them unless there's a reason not to, and update this table when installing.

| Package | Version | Where | Installed here? |
|---|---|---|---|
| typescript | 5.9.3 | root dev | yes |
| vitest | 4.1.12 | root dev | yes |
| eslint / @eslint/js | 9.39.1 | root dev | yes |
| typescript-eslint | 8.72.1 | root dev | yes |
| tsx | 4.23.15 | root dev, cli and mcp (bin runner) | yes |
| @types/node | 22.20.5 | root dev | yes |
| unified | 11.0.5 | core | yes |
| remark-parse | 11.0.0 | core | yes |
| mdast-util-to-string | 4.0.0 | core | yes |
| @types/mdast | 4.0.4 | core dev | yes |
| zod | 4.6.7 | core, mcp (tool input schemas) | yes |
| playwright-core | 1.64.1 | core, cli, mcp | yes |
| ws | 8.22.0 | core dev (guard test fixture), cli (`--seance` event server) | yes |
| @types/ws | 8.18.2 | core dev, cli dev | yes |
| fast-check | 4.10.2 | core | yes |
| @anthropic-ai/sdk | 1.3.0 | core (F05 compiler) | yes |
| @modelcontextprotocol/sdk | 1.32.2 | mcp (F11 stdio server; `registerTool` takes zod 4) | yes |
| Big List of Naughty Strings | commit `db33ec7` (vendored, MIT) | core `src/personas/generators/data/` | yes |

## Local setup (target)

```bash
npm ci
npx playwright-core install chromium
npm run health
npm --prefix fixtures/candy-swap install && npm run candy:check   # F10 Done-when (D-37)
npm run --prefix fixtures/candy-swap db:reset && npm run --prefix fixtures/candy-swap dev   # :4000
doppler run -- npm run summon -- --spec fixtures/candy-swap/.kiro/specs/candy-swap --seance
```
