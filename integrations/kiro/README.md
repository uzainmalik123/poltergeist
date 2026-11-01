# Kiro integration templates

Files here are installed **into other projects'** `.kiro/` folders (D-01). F13's `poltergeist init` will write them; until then, copy them by hand.

- **`mcp.json`:** merge its `poltergeist` entry into the project's `.kiro/settings/mcp.json`. Kiro launches `poltergeist-mcp` over stdio, and the agent gets `list_criteria`, `summon_ghosts`, `get_run_status`, `get_haunting_report` and `rehaunt`. The three read-only tools are auto-approved; the two that drive a browser ask first.
- **Before npm publish (KI-33):** `npx poltergeist-mcp` only resolves inside this repo's workspace. For another project, set `"command": "node"` and `"args": ["<path to this repo>/packages/mcp/bin/poltergeist-mcp.js", "--root", "<that project>"]`.
- Kiro only expands `${ANTHROPIC_API_KEY}` once you've approved that variable. Facts and open questions: [`docs/kiro-notes.md`](../../docs/kiro-notes.md).
