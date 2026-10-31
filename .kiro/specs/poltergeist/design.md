# Design Document

> How Poltergeist fits together. *What* must be true is in `requirements.md`, feature scopes in `docs/PRD.md`, rulings in `docs/DECISIONS.md`, the look in `docs/THEME.md`.

## 1. Architecture

```
                ┌────────────────────── @poltergeist/core ──────────────────────┐
 requirements ─►│ Spec Reader ─► Scout ─► Compiler (LLM) ─► Runner (Playwright) │─► Verdicts ─► Report
     .md        │   F01          F03       F05 + cache      F06 + personas F04  │      F07        F08
                └───────────────────────────────┬───────────────────────────────┘
                                                │ run events (in-proc emitter + WebSocket)
                 ┌──────────────────────────────┼─────────────────────────────┐
                 ▼                              ▼                             ▼
            CLI (F09)                    Séance Room (F12)              Run folder (.poltergeist/runs/<id>)
                 ▲                              ▲ replay (F15)                │
                 │                              └─────────────────────────────┘
          MCP server (F11) ◄── Kiro agent ◄── hook (F13) / Power (F18) / steering (F17)

          Costume Kit (F26): wordmark, sprites, glyph renderer, palette ─► CLI · Report · Séance
```

- **One engine, many front doors.** The CLI, the MCP server and the Séance live mode all call `summon()` in `@poltergeist/core`.
- **The LLM is only used at compile time** (D-03). Running and judging are deterministic. Plans can be inspected and are cached.
- **The run folder is the source of truth.** Reports and replays are built from it.
- **The costume is a layer, not the logic.** `@poltergeist/costume` has no knowledge of runs. It turns frames into glyphs and gives everyone the same sprites and colours.

## 2. Packages

```
packages/
  core/       spec, config, safety, scout, personas, compiler, runner, verdicts, report, events
  costume/    glyph renderer (Bayer → glyph ramp), sprites, wordmark, palette tokens (F26)
  cli/        `poltergeist` binary: summon, init, replay, export
  mcp/        MCP stdio server over core
  seance/     Vite + React dashboard (live + replay)
integrations/kiro/   templates installed INTO target projects: hook, steering, MCP snippet, Power
fixtures/candy-swap/ demo target app + its own .kiro/specs/candy-swap/ (built in Kiro, D-10)
```

## 3. Config: `poltergeist.config.json` (D-17, D-20, D-21)

```jsonc
{
  "target": "http://localhost:4000",          // origin only: no path, query or hash
  "allowedHosts": [],                           // extends localhost, 127.0.0.1, ::1; "*.x" wildcards; bare "*" rejected
  "routes": [
    { "path": "/", "auth": false },
    { "path": "/market", "auth": true },        // true = "default" account
    { "path": "/trade/new", "auth": "default" }
  ],
  "accounts": {
    "default": {
      "loginRoute": "/login", "username": "ghost1", "password": "env:POLTERGEIST_PW",
      "fields": { "username": { "label": "Handle" } }   // optional D-15 overrides of the login heuristic
    }
  },
  "resetCommand": "npm run --prefix fixtures/candy-swap db:reset",
  "resetTimeoutMs": 60000,
  "concurrency": 12,                            // 1–20
  "reps": 3,                                    // 1–10
  "forbidden": [{ "method": "DELETE", "path": "/api/admin/*" }],
  "model": "claude-sonnet-5-5"
}
```

Relative paths resolve from the config file's directory. A bad config throws `ConfigError` (field-path issues, `exitCode: 2`). `target` may not contain userinfo. An unused account whose `env:NAME` is unset is dropped with a warning (D-29). `resetCommand` runs through the shell in the config's directory. It must not start long-lived servers: `runReset` resolves when the command exits (D-29).

## 4. Data model (abridged)

```ts
type EarsKind = 'event' | 'state' | 'unwanted' | 'optional' | 'ubiquitous';
type Criterion = { id: string; requirement: string; requirementId: string; text: string; raw: string;
                   line: number; kind: EarsKind | 'freeform'; ears: EarsClauses | null; hash: string };
type EarsClauses = { kind: EarsKind; trigger?: string; precondition?: string; subject?: string; response: string };
type Target = { role: string; name: string } | { label: string } | { text: string } | { testId: string };   // D-15
type Persona = { id: PersonaId; name: string; tagline: string; behaviour: string; allowedSteps: StepType[];
                 generators: GeneratorId[]; actors: 1 | 2; sprite: string };   // D-31: sprite is a Costume Kit key
type GeneratorId = 'plain' | 'naughty' | 'emoji' | 'rtl' | 'long' | 'empty' | 'whitespace' | 'fastcheck';      // D-31
// STEP_TYPES (the §6 step list) and both id lists live in core/personas; F05 builds its zod enums from them.
type PairVerdict = 'haunted' | 'flaky' | 'inconclusive' | 'clean' | 'notApplicable' | 'uncompilable';
type BlockReason = 'host' | 'forbidden' | 'scheme' | 'redirect' | 'leak';                                  // D-18, D-22
type RouteScout = { path: string; slug: string; identity: string;                                          // D-20, D-21, D-30
                    status: 'ok' | 'redirected' | 'unreachable' | 'authFailed'; reason?: string; finalPath?: string;
                    title?: string; settled: boolean; interactive: { role: string; name: string; count: number;
                    label?: string; testId?: string }[]; testIds: { testId: string; role?: string; name?: string }[];
                    snapshot: string; snapshotFull: string; trimmed: boolean; routeHash: string; blocked: BlockedRequest[] };
```

Scout is `scout(browser, loaded, { outDir, routeTimeoutMs?, loginTimeoutMs?, onRoute?, onBlocked? })` → `{ routes, scoutHash, sessions }` (`packages/core/src/scout/`). `sessions` holds each account's `storageState` in memory only. Every emitted `label` and `testId` resolves to exactly one element, and `JSON.stringify({interactive, testIds, snapshot})` fits 16000 characters.

## 5. Network guard (D-17, D-18, D-22)

Every browser Poltergeist launches goes through one path:

1. `guardLaunchOptions()`: Chromium flags that keep WebRTC off non-proxied UDP. An init script also disables `RTCPeerConnection`.
2. `newGuardedContext(browser, opts)` is the **only** way to make a context. It sets a dead local proxy (`127.0.0.1`, port 0) whose bypass list is `<-loopback>` first, then loopback and `allowedHosts`. Any hop to a non-allowlisted host, including link-local such as `169.254.169.254`, therefore fails at the network layer. It also blocks service workers and rejects caller `proxy` overrides.
3. `context.route` aborts non-allowlisted and `forbidden` requests (`route.continue()` for allowed ones, with no buffering). `routeWebSocket` does the same for WebSockets.
4. Redirect hops surface via `requestfailed`:
   - `ERR_PROXY_CONNECTION_FAILED` / `ERR_BLOCKED_BY_CLIENT` on the hop → `host`.
   - The same error on an allowlisted original request (Chromium hides the hop under load) → `redirect`.
   - Anything else unconfirmed → `leak`, which F06 treats as a safety failure.
5. The guard aborts first, then calls `onBlocked`. A throwing callback is swallowed.
6. The bypass-list builder is internal and re-validates every host. `forbidden` paths are percent-decoded before matching (D-29).

## 6. Haunting Plan DSL (the LLM's output contract)

```jsonc
{
  "criterion": "3.2",
  "persona": "doppelganger",
  "intent": "Two sessions claim the same candy at the same time; only one should succeed.",
  "routes": ["/market"],
  "actors": {
    "a": [ { "goto": "/market" }, { "holdRequests": "POST /api/claims" },
           { "click": { "role": "button", "name": "Claim Sour Skulls" } }, { "barrier": "fire" },
           { "releaseRequests": "POST /api/claims" } ],
    "b": [ { "goto": "/market" }, { "click": { "role": "button", "name": "Claim Sour Skulls" } }, { "barrier": "fire" } ]
  },
  "assert": [
    { "api": { "method": "GET", "path": "/api/candies/sour-skulls", "jsonPath": "$.claims.length", "equals": 1 } },
    { "noConsoleErrors": true }
  ]
}
```

- **Steps:** `goto`, `click`, `dblclick`, `fill {target, input:{generator|literal}}`, `press`, `back`, `reload`, `wait (≤2000 ms)`, `throttle {profile}`, `barrier`, `holdRequests`, `releaseRequests`, `login {account}`, `logout`.
- **Targets:** D-15 only, and only ones Scout emitted.
- **Assertions:** `textVisible`, `textNotVisible`, `urlMatches`, `elementCount`, `api {method,path,jsonPath?,status?,equals?}`, `noConsoleErrors`, `noUncaughtExceptions`.
- **Not applicable:** `{ "notApplicable": true, "reason": "…" }`.
- The zod schema is the single definition. The structured-output JSON Schema and the TS types are generated from it.

## 7. Personas

| Persona | Behaviour | Typical breakage | Sprite colour |
|---|---|---|---|
| **Wraith** (impatient) | Double-clicks, resubmits, goes back or reloads mid-request | Duplicates, stuck spinners | ectoplasm |
| **Banshee** (chaotic input) | Naughty strings, emoji, RTL, 10k chars, whitespace, empty | Validation gaps, 500s | ectoplasm |
| **Doppelgänger** (twin) | Same account in two contexts, racing via barrier + held requests | Double-claims, lost updates | ectoplasm (two sprites) |
| **Lich** (ancient device) | 360×640, slow 3G, CPU throttling | Hidden buttons, timeouts | ectoplasm |
| **Revenant** (returning) | Stale tab, expired session, deep links after logout | Auth leaks, crashes on stale state | ectoplasm |
| **Changeling** (keyboard-only) | Tab, Enter and Space only | Unreachable controls | ectoplasm |

Sprites are defined in `@poltergeist/costume` (`docs/THEME.md` §4).

## 8. Run events (WebSocket `ws://localhost:6660/runs/<id>`)

`run.started` · `scout.route` · `plan.compiled` · `ghost.spawned` · `ghost.step {ghostId, step, x?, y?}` · `ghost.frame {ghostId, jpegBase64}` (≤ 4 fps per ghost) · `guard.blocked {ghostId, reason, url}` · `assert.result` · `verdict.pair` · `verdict.criterion` · `run.finished`.

Every event except frames is appended to `events.ndjson`. Frames are sampled to disk for replay. The Séance turns frames into glyphs client-side (F26); the run folder keeps real JPEGs.

## 9. Run folder

```
.poltergeist/
  cache/plans/<cacheKey>.json
  runs/<runId>/
    run.json            config snapshot (raw env:NAME, never secrets), spec hash, scoutHash, model, timings
    scout/<slug>.json   "/" → index, "/trade/new" → trade__new
    plans/<criterion>__<persona>.json
    events.ndjson
    frames/<ghostId>/<seq>.jpg
    artifacts/<criterion>__<persona>__rep<k>/{screenshot.png,trace.zip}
    verdicts.json
```

## 10. MCP tools

| Tool | Input | Output |
|---|---|---|
| `list_criteria` | `{specDir}` | `[{id, text, kind}]` |
| `summon_ghosts` | `{specDir, configPath?, personas?, reps?}` | `{runId, counts, haunted: [ids], reportPath}`, or `{runId}` with a status tool if KI-12 forces async |
| `get_haunting_report` | `{specDir, criterion?}` | Markdown section(s) |
| `rehaunt` | `{specDir, ids}` | `{runId, changes: [{id, from, to}]}` |

## 11. Kiro loop (target project)

1. `npx poltergeist init` writes the MCP entry, steering and hook into the project's `.kiro/` (F13).
2. Kiro implements spec tasks as usual.
3. The hook fires, or the user asks Kiro to "summon the ghosts".
4. The agent calls `summon_ghosts`, then reads `haunting-report.md`.
5. The agent fixes the code and calls `rehaunt`. The lines go from possessed to clean.

> Hook triggers, the hook JSON schema, the MCP settings path and the Power format are **unverified** (KI-06). Confirm them in `docs/kiro-notes.md` before F11, F13 or F18.
