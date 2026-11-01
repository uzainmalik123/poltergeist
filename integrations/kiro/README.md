# Kiro integration templates

Files here are installed **into other projects'** `.kiro/` folders (D-01). F13's `poltergeist init` will write them; until then, copy them by hand.

- **`mcp.json`:** merge its `poltergeist` entry into the project's `.kiro/settings/mcp.json`. Kiro launches `poltergeist-mcp` over stdio, and the agent gets `list_criteria`, `summon_ghosts`, `get_run_status`, `get_haunting_report` and `rehaunt`. The three read-only tools are auto-approved; the two that drive a browser ask first.
- **Replace both placeholders with absolute paths.** One is the bin in your Poltergeist checkout. The other is `--root`, the project Kiro has open. Kiro doesn't document the working directory it spawns servers in, so `--root .` could widen the root to wherever that happens to be (D-38).
- **Don't use `npx poltergeist-mcp`.** The package isn't on npm yet (KI-33). Outside this repo's workspace, `npx` would fetch whatever package holds that name from the public registry, and run it without asking (Kiro's spawn isn't a TTY) with your API key in its env.
- Kiro only expands `${ANTHROPIC_API_KEY}` once you've approved that variable. Facts and open questions: [`docs/kiro-notes.md`](../../docs/kiro-notes.md).
