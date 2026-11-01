# Kiro notes (KI-06)

Facts about Kiro that Poltergeist builds on, each with its source and confidence. They were researched on **2026-11-01** for F11. **Re-check anything marked unverified in a real Kiro session** before F13 or F18 depends on it.

## MCP (F11): confirmed from the docs

Source: <https://kiro.dev/docs/mcp/configuration/> and <https://kiro.dev/docs/mcp/>

- **Config files:**
  - workspace `.kiro/settings/mcp.json`;
  - user `~/.kiro/settings/mcp.json`.
  - Both are merged, and the workspace wins.
- **Format:** the top-level key is `mcpServers`.
  - Local server fields: `command` (required), `args`, `env`, `disabled`, `autoApprove` (tool names) and `disabledTools`.
  - Remote servers use `url`, `headers` and `oauth`.
- **Env interpolation:** `"${VAR_NAME}"`. The IDE expands only variables the user has approved.
- **Transports:** stdio and Streamable HTTP/SSE.
- **Features:** tools, prompts and resources (through `#` mentions), and elicitation.
- **Tool names:**
  - must match `^[a-zA-Z][a-zA-Z0-9_]*$` (no hyphens or dots);
  - can be at most **64 chars including the server prefix**;
  - tools with an empty description are dropped;
  - descriptions over 10 000 chars trigger a warning.

## MCP: unverified

- **`cwd`** for a local server isn't documented, and neither is a `${workspaceFolder}`-style variable. That's why `poltergeist-mcp` takes `--root`, always as an absolute path (D-38).
- **Timeouts:**
  - the custom-agent reference (<https://kiro.dev/docs/custom-agents/configuration-reference/>) lists a per-server `timeout` (handshake, default 60 000 ms) and `requestTimeout` (per call, default 120 000 ms);
  - it's unknown whether the IDE honours them in `mcp.json`;
  - Poltergeist's tools long-poll for at most 100 s, and 50 s by default (D-38, KI-12).
- **Progress notifications:** not documented. Assume they're ignored.
- **Tool output size limit:** not documented. Poltergeist caps every result at 6 000 chars (D-38).

## Hooks (F13): unverified

Source: <https://kiro.dev/docs/hooks/> and <https://kiro.dev/docs/hooks/types/>

- **Location:** JSON files in `.kiro/hooks/`, shaped `{"version":"v1","hooks":[{"name","trigger","matcher","action":{"type":"command"|"agent",…}}]}`.
- **Actions:** a `command` action gets context as JSON on stdin; an `agent` action injects a prompt.
- **IDE triggers:** Prompt Submit, Agent Stop, Session Start, Pre/Post Tool Use, File Create/Save/Delete, and Pre/Post Task Execution.
- **"Manual" triggers** existed only in IDE 0.x.
- The older `.kiro.hook` format isn't mentioned in the current docs.

## Powers (F18): unverified

Source: <https://kiro.dev/docs/powers/> and <https://kiro.dev/docs/powers/create/>

- **Format:** the Agent Plugins format, a directory with a required `plugin.json` (activation keywords), optional `skills/<name>/SKILL.md` and an optional `mcp.json`.
- The older `POWER.md` format still works.
- The exact `plugin.json` fields aren't verified.

## Manual F11 check in Kiro (KI-46)

1. Start Candy Swap (`npm --prefix fixtures/candy-swap run dev`) once F10 exists (KI-44).
2. Open `fixtures/candy-swap/` as the Kiro workspace. Add `integrations/kiro/mcp.json`'s entry to `.kiro/settings/mcp.json`, replacing both placeholders with **absolute** paths: the bin, and `--root` set to the workspace (`…/fixtures/candy-swap`). Never use `--root .` (spawn cwd unknown) or `npx poltergeist-mcp` (it would resolve from public npm). Approve `ANTHROPIC_API_KEY`.
3. In the MCP panel, check that the five tools are listed and none is excluded.
4. Ask the agent: "summon the ghosts on the candy-swap spec". It should call `summon_ghosts`, poll `get_run_status` if needed, read `get_haunting_report` for a haunted id, fix the code, then call `rehaunt` with that id until it's clean.
5. Note in KI-06 and KI-12 whether any call timed out, and what Kiro's MCP log says about `requestTimeout`.
