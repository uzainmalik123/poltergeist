# Reanimator: Stack

> Proposed (D-R9). Confirm and pin exact versions when scaffolding (R0). The teammate is vibe-coding, so prefer boring, well-documented choices the agent knows well.

## Summary

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript**, Node ≥ 22, ESM | Matches Poltergeist; the agent handles it well; Poltergeist is TS |
| Frontend | **Vite + React + TypeScript** | Fast dev, simple, lots of examples for the agent |
| The art renderer | **Canvas 2D** (plain, no library), per [THEME.md](THEME.md) §3 | Full control of the dot-matrix dither; no dependency |
| Styling | Plain CSS with the palette tokens from THEME §4 | Dark-only; the look is canvas, not CSS |
| Font | **JetBrains Mono** (Google Fonts, OFL) for glyph/text surfaces | Good monospace coverage |
| Backend | **Node + Hono** (or Express) | Runs revive (install/build/serve) and the Poltergeist attack, streams status to the UI |
| Revive sandbox (v1) | A temp working dir on the dev machine | Enough for one prepared, trusted repo (D-R6). Containers only if R9 happens |
| Red-team engine | **Poltergeist** (the sibling at `../poltergeist`) via its CLI `summon` / MCP | Already built; never re-implement it (D-R4, KI-R4) |
| Agent (for healing) | **Kiro** (and/or Claude Code) edits the revived repo | The "familiar"; this is the Kiro-integration story |
| Health gate | `npm run health` (typecheck + lint + test) + CI | Same discipline as Poltergeist |
| Tests | Vitest (unit, renderer snapshot) | Matches the sibling |

## How the pieces talk

```
React UI (canvas scenes) ──HTTP/WebSocket──> Node backend
                                              ├─ revive: run install/build/serve in a temp dir → vitals
                                              ├─ serve the revived app at http://localhost:<port>
                                              └─ attack: run Poltergeist against that origin → haunting-report.json
                                                        (Poltergeist = ../poltergeist, CLI or MCP)
UI reads vitals + report and draws the raise, Death's attack, and the wounds.
```

## SaaS / external

| Service | For | Required? |
|---|---|---|
| **Kiro** (Pro+ during the event) | The familiar: search, surgery, healing; the Kiro-integration story | **Yes** |
| **Anthropic API** | Poltergeist's compiler needs it (see the sibling's STACK) | **Yes** (via Poltergeist) |
| **GitHub** | Public repo + the dead repos revived | **Yes** |
| **Doppler** | Secrets, same as the sibling | Team convention |
| **YouTube** | The < 3-min demo video | **Yes** |
| **Devpost** | Submission | **Yes** |
| Vercel / static host | Hosted replay (R11) | Med |

## AWS

- Same stance as Poltergeist: optional only (its Bedrock provider). Reanimator itself adds no required AWS. If a hosted replay wants AWS for the "it's a Kiro/AWS event" angle, S3 + CloudFront for the static replay is the cheap option (see Poltergeist D-12).

## Ports (suggested; avoid clashing with Poltergeist's 4000/6660/6661)

| Port | Service |
|---|---|
| 5173 | Vite dev server (Reanimator UI) |
| 7070 | Reanimator backend |
| 7100+ | The revived app (served for the attack) |

## Pinned versions

Fill in when installed (R0). Reuse Poltergeist's pins where shared (TypeScript 5.9.x, Vitest 4.1.x, ESLint 9.39.x).
