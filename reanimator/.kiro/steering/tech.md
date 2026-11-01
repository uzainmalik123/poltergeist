# Tech

- TypeScript, Node ≥ 22, ESM. Vite + React for the UI. Canvas 2D for the dot-matrix renderer (no art library). A small Node (Hono) backend to run revive and the attack.
- The red-team is the **Poltergeist** engine at `../poltergeist` — called, never re-implemented (`docs/DECISIONS.md` D-R4). Read its README and docs before wiring (KI-R4).
- Kiro (and/or Claude Code) is the agent that heals findings.
- `npm run health` (typecheck + lint + test) must be green after every change, same as the sibling. Pin versions (`docs/STACK.md`).
- Fresh code only — nothing copied from the earlier Reanimator prototype or `poltergeist-old` (D-R2).
