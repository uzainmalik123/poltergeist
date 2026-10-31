# Poltergeist: Decisions

> A record of important decisions. Add new ones at the bottom with the next ID. To change a decision, don't edit it: add a new one and mark the old one `Superseded by D-xx`.
> Status values: `Accepted` · `Proposed` (needs team sign-off) · `Superseded`
>
> **D-01 to D-22 were made while building the prototype** (`../poltergeist-old`, before the hacking window). They're carried over word for word because they still bind the rebuild. Their dates and "F0x done" notes refer to the prototype. Where the fresh start changed something, the table says so. D-23 onward were made for this repo. References to `SPEC.md`, `SPEC §6.x` or `R<n>.<m>` in those entries now mean `.kiro/specs/poltergeist/design.md` and requirement `<n>.<m>` in `requirements.md` (D-25).

| ID | Decision | Status |
|---|---|---|
| D-01 | Integrate with Kiro, don't just code with Kiro | Accepted (the "`.kiro/` is a placeholder" part is superseded by D-25) |
| D-02 | Target the Frankenstein category | Superseded by D-23 |
| D-03 | The LLM compiles to a constrained JSON DSL, and running is deterministic | Accepted |
| D-04 | Input payloads come from deterministic generators, never from the LLM | Accepted |
| D-05 | The host allowlist defaults to localhost only and can't be widened from steering | Accepted |
| D-06 | Verdicts need reproduction (⌈2N/3⌉ of N=3 by default) | Accepted |
| D-07 | Concurrency is capped (default 12, max 20) | Accepted |
| D-08 | This is a QA tool, not a security scanner | Accepted |
| D-09 | Plain QA wording in prompts. The theme lives only in the UI and copy | Accepted |
| D-10 | Candy Swap is built honestly, with no planted bugs | Accepted |
| D-11 | Stack: TS/Node 22 monorepo, Playwright, zod, Claude, Vite + React | Accepted |
| D-12 | Static replay on Vercel. AWS only as an optional Bedrock provider | Proposed |
| D-13 | Personas are a fixed built-in set. No user-defined personas in v1 | Accepted |
| D-14 | Reports are written into the spec folder, and spec files are never edited | Accepted |
| D-15 | Targets are specified by role, label, text or test id, never by raw CSS or XPath | Accepted |
| D-16 | Criterion identity: Kiro-style `N.M` IDs for people, a per-criterion content hash for caching; deterministic keyword EARS parsing | Accepted |
| D-17 | Config and safety rules (F02): strict zod config, extend-only loopback allowlist, network-layer guard for hosts and `forbidden` rules, env/literal secrets with redaction | Accepted |
| D-18 | Network guard uses a dead-proxy backstop and blocks WebRTC (F02) | Accepted |
| D-19 | One health gate (`npm run health`: typecheck + lint + tests) run after every implementation and in CI | Accepted |
| D-20 | Route Scout rules (F03): one guarded context per identity, heuristic login with optional D-15 field overrides, in-memory storageState, ariaSnapshot-based capture, per-route hash over interactive elements | Accepted (the "fixture first" bullet is superseded by D-25) |
| D-21 | Route Scout implementation rulings (F03): origin-only `target`, emitted labels and testIds must resolve, hard per-route budget, no summary file, visit-order `onRoute`, exact login-path match, redacted `finalPath` and blocked URLs | Accepted |
| D-22 | Network guard reports a redirect hop that Chromium only surfaces as the original request's dead-proxy failure, with reason `redirect` (extends D-18) | Accepted |
| D-23 | Target the **Costume Contest** category (supersedes D-02) | Accepted |
| D-24 | The costume is a "haunted terminal": ASCII glyphs via Bayer dither, ectoplasm green for ghosts only, distinct from Reanimator | Accepted |
| D-25 | Fresh start: new repo inside the hacking window, rebuilt from docs (no ported code), real `.kiro/` spec, new build order | Accepted |
| D-26 | Costume Kit is its own package and a High feature (F26); possession/exorcism move there from F22 | Accepted |
| D-28 | `main` is protected by a GitHub ruleset: changes land only through PRs with a green `health` check | Accepted |
| D-27 | Spec Reader edge-case rulings and API (F01, extends D-16): `parseSpec`/`parseRequirements`, warning codes, KI-16 edge cases | Accepted |

---

### D-01: Integrate with Kiro, don't just code with Kiro
- **Context:** Judging scores how effectively Kiro is used. Most entries only *build* their app in Kiro. The team wants the product itself to plug into Kiro.
- **Decision:**
  - Poltergeist's input is a Kiro spec.
  - Its outputs land in the spec folder.
  - Kiro's agent drives it through MCP, a hook, steering and a Power.
  - In **this playtest repo**, `.kiro/` is a placeholder. The real use of Kiro (specs, steering and hooks for building Poltergeist, and building Candy Swap from its spec in Kiro) happens in the **main project**.
- **Consequences:**
  - The Kiro integration features are F11, F13, F17 and F18.
  - Templates installed into *target* projects live in `integrations/kiro/`. That keeps them separate from this repo's own `.kiro/`.

### D-02: Target the Frankenstein category · Superseded by D-23
- **Context:** In the 2025 categories, Skeleton Crew will likely be crowded with InteractionKit copies, and Resurrection overlaps with the Reanimator project.
- **Decision:** Enter Frankenstein (EARS specs + LLM + Playwright + property-based inputs + MCP/Power stitched together). Also go for the bonus prizes (Most Creative, Blog Post, Social).
- **Open:** re-check once the 2026 tracks are published (KI-05). It's `Proposed` until then.

### D-03: The LLM compiles to a constrained JSON DSL, and running is deterministic
- **Context:** The riskiest part is turning loose criteria into reliable checks. Free-form generated Playwright code is flaky, can't be validated, executes arbitrary code, and looks like "write me an attack script" to a model.
- **Decision:**
  - The LLM outputs Haunting Plans in a small JSON DSL (SPEC §6.3), validated with zod.
  - The runner interprets the DSL.
  - The LLM is used only at compile time.
  - Plans are cached.
- **Consequences:**
  - F23 and F24 are scrapped.
  - Plans are readable in the UI and the report.
  - If the DSL can't express a criterion, the plan is `notApplicable`. That's honest, and better than a fake pass.

### D-04: Input payloads come from deterministic generators, never from the LLM
- **Decision:**
  - Banshee and the other personas choose a generator ID (naughty, emoji, rtl, long, empty, whitespace, fast-check with a seed).
  - The values are produced by our code.
- **Why:** reproducibility, no refusals, and no need to review what the LLM invented.

### D-05: The host allowlist defaults to localhost only and can't be widened from steering
- **Decision:**
  - Only `localhost` and `127.0.0.1` are allowed unless `poltergeist.config.json` lists other hosts.
  - All requests outside the allowlist are blocked during runs.
  - Steering (F17) can only tighten the rules.
- **Why:** it prevents misuse against third-party sites. It's also a point to make to judges when they ask "can this be abused?"

### D-06: Verdicts need reproduction
- **Decision:**
  - Each plan runs N=3 times by default, with a reset between repetitions.
  - A pair is `haunted` when the same assertion fails ≥ ⌈2N/3⌉ times, and `flaky` when it fails less often than that.
  - Plan errors are `inconclusive`. They are never counted as app bugs.
- **Why:** a red mark has to be trustworthy, for the video and for Kiro's agent.

### D-07: Concurrency is capped
- **Decision:** 12 contexts by default, 20 at most.
- **Why:** Poltergeist is not a load tester. 12 tiles is also about the most the Séance can show readably at 1080p.

### D-08: This is a QA tool, not a security scanner
- **Decision:** no exploit generation, no SQLi/XSS crafting, no auth bypass attempts beyond Revenant's stale-session flows on the user's own app.
- **Consequences:** F25 is scrapped. The `forbidden` rules let users exclude destructive endpoints.

### D-09: Plain QA wording in prompts
- **Decision:**
  - Prompts describe "end-to-end edge-case test generation for an application the user owns".
  - Ghost names, haunting and similar theme words appear only in the UI, the reports and the docs.
- **Why:** it reduces refusals and watered-down output, and it helps plan quality.

### D-10: Candy Swap is built honestly, with no planted bugs
- **Context:** Judges probe whether a demo is staged.
- **Decision:**
  - Build Candy Swap quickly and normally (in Kiro, in the main project).
  - Whatever Poltergeist finds is what goes in the demo.
  - The bugs found are logged with timestamps in `docs/` as evidence.
- **Risk:** it might find nothing exciting (KI-04).

### D-11: Stack
- **Decision:** see [STACK.md](STACK.md): a TS/Node 22 npm-workspaces monorepo, Playwright, zod, Anthropic SDK, MCP SDK, Vite + React, and Hono + SQLite for the demo target.
- **Why:**
  - It matches Reanimator, so tooling and experience carry over.
  - Every critical library is TypeScript-first.

### D-12: Hosting and AWS
- **Proposal:**
  - Host the static Séance replay on Vercel.
  - Use AWS only for the optional Bedrock provider (F19).
  - Swapping to Amplify Hosting or S3 + CloudFront is possible later without code changes.
- **Open:** decide whether an "AWS-hosted" story is worth it for judging (Kiro is an AWS product). Decide before F15 starts.

### D-13: Personas are a fixed built-in set in v1
- **Decision:**
  - Six built-in personas (three core in F04, two in F16, one in F20).
  - Steering can enable or disable them but cannot define new ones.
- **Why:** it keeps scope down, and persona quality matters more than quantity.

### D-14: Reports are written into the spec folder, and spec files are never edited
- **Decision:**
  - Write `haunting-report.md` and `.json` next to `requirements.md`.
  - Never touch `requirements.md`, `design.md` or `tasks.md`.
- **Why:** Kiro's agent naturally reads the spec folder, and the user keeps ownership of their spec.

### D-15: Targets by role, label, text or test id
- **Decision:** the DSL targets use only `{role,name}`, `{label}`, `{text}` or `{testId}`, all taken from scout output.
- **Why:**
  - More stable than CSS.
  - Readable in reports.
  - The compiler can only reference elements Scout actually saw, so it can't make up selectors.

### D-16: Criterion identity and spec parsing rules (F01)
- **Context:** grilling F01 (2026-10-30). Kiro documents no ID scheme. A real Kiro-style spec (Reanimator) uses `### Requirement N: Title`, a numbered list per requirement with no explicit IDs, sometimes no `#### Acceptance Criteria` header, `THE <Component> SHALL` subjects and criteria with two SHALLs. Its tasks.md cites criteria as `N.M`.
- **Decision:**
  - **ID** = `N.M`. `N` is the number in the `Requirement N` heading (not its position). `M` is the criterion's rendered list number (`list.start + index`). This supersedes the `R<req>.<n>` form in SPEC R1.2. If `N` is used twice, the second occurrence becomes `Nb`, the third `Nc`, with a warning.
  - **Hash** = first 12 hex characters of sha256 over the criterion's normalized plain text (NFC, whitespace collapsed, trimmed, case kept). The requirement title is not included. The plan cache keys on the hash, so inserting a criterion elsewhere never invalidates a plan, even though later IDs shift.
  - **Requirement** = any heading matching `Requirement N` (any level, case-insensitive, separators `:` `.` `-` `–` optional). Its criteria are the first *ordered* list before the next requirement heading or the next heading at the same or a higher level, whether or not an `Acceptance Criteria` sub-heading sits in between. Nested bullets are folded into the parent criterion's text. If the file has no `Requirement N` headings, every heading with an ordered list under it becomes a requirement numbered by position, with a warning.
  - **EARS** is classified by deterministic keyword rules, never an LLM (D-03). The parser splits on WHILE / WHEN / IF / WHERE / THEN: upper case anywhere, any case only at the start of the text or right after a comma. The text before the first SHALL (any case) gives the clauses, and everything after it is the `response`. Priority for `kind`: unwanted (IF) > event (WHEN) > state (WHILE) > optional (WHERE) > ubiquitous. No SHALL means `freeform` (`ears: null`). A criterion with several SHALLs stays one criterion. `subject` holds the noun between THE and SHALL (e.g. `Archivist`).
  - **Errors:** a missing or unreadable `requirements.md` throws `SpecNotFoundError`. Any content, however malformed, never throws. It returns `{criteria, warnings}`.
  - A `Criterion` also carries `raw` (source markdown), `line` (1-based), `requirementId` (`"3"`, `"3b"`) and `kind`.
- **Consequences:**
  - Reports, MCP and Séance show the same numbers Kiro and the user's tasks.md use.
  - A bulleted (unordered) criteria list yields 0 criteria and a warning. Revisit this if real Kiro output uses bullets (KI-16).

### D-17: Config and safety rules (F02)
- **Context:** grilling F02 (2026-10-30). The runner (F06) and CLI (F09) don't exist yet, but F02's Done-when needs a refused run, a blocked third-party fetch and a rejected concurrency of 25.
- **Decision:**
  - **Delivery:** F02 ships library functions in `@poltergeist/core` (`src/config/`, `src/safety/`). A bad config throws `ConfigError` (field-path issues, `exitCode: 2`), and F09 maps it to the exit code. The network guard is tested against real headless Chromium, so `playwright-core` is a core dependency from F02 onward.
  - **Schema:** strict zod (unknown keys are errors). It covers every SPEC §6.1 field: `target` is an http(s) URL, `routes[].auth` is `boolean | "<account>"` (`true` = `"default"`, and referenced accounts must exist), `concurrency` is an int 1–20 (default 12), `reps` is an int 1–10 (default 3), `model` defaults to `claude-sonnet-5-5`, plus `resetCommand?` and `resetTimeoutMs?` (default 60000). The config is `--config` or `./poltergeist.config.json`, and relative paths resolve from the config file's directory.
  - **Allowlist:** matches hostnames only (any port, any of http/https/ws/wss), case-insensitively. Entries are exact hosts or a leading `*.` subdomain wildcard, and bare `*` is rejected. `allowedHosts` **extends** the loopback defaults `localhost`, `127.0.0.1` and `::1`; it never replaces them. A non-allowlisted `target` fails at load time.
  - **Network guard:** `installNetworkGuard(context, …)` aborts every request to a non-allowlisted host and every request matching a `forbidden` rule (`blockedbyclient`), and calls `onBlocked({url, host, method, resourceType, reason})`. `data:`, `blob:` and `about:` are allowed. WebSockets go through the same check (`routeWebSocket`). Service workers are blocked through the context options. Other schemes are blocked.
  - **`forbidden`** is enforced at the network layer, not on DSL steps (steps are clicks, not HTTP calls). `method` is exact (case-insensitive) or `*`. `path` is a glob where `*` matches any characters including `/`. The query string is ignored. F06 marks the step that caused the request as `blocked-by-rule`. SPEC R2.6 is reworded to match.
  - **Secrets:** `env:NAME` is resolved at load time. A missing or empty variable is a `ConfigError` only for accounts some route uses. Literal passwords are allowed with a warning (demo accounts are fake). Resolved secrets are scrubbed by a `redact()` helper, and the config snapshot keeps the raw `env:NAME` text.
  - **Reset:** `runReset()` runs `resetCommand` through the shell, in the config file's directory, with a timeout. It kills the whole process group on timeout. A non-zero exit or a timeout is a system error (`ResetError`), never an app bug. When reset runs is decided by F06 (KI-13).
  - **Concurrency:** F02 ships `createLimiter(n)`, and F06 must open contexts through it.
  - **Verdicts:** F02 makes no verdict decisions. F06/F07 decide what a blocked request means for a pair, and F06 adds a run event for blocked requests.
- **Consequences:** F06 must create every context with `guardContextOptions()` and `installNetworkGuard`, open contexts through the limiter, and call `runReset`. F09 maps `ConfigError` and `ResetError` to exit code 2.


### D-18: Network guard uses a dead-proxy backstop and blocks WebRTC (F02)
- **Context:** during F02 implementation, Playwright's `context.route` was found never to see redirect hops. `route.fetch({maxRedirects:0})` leaked on multi-hop chains, exempted EventSource and buffered responses (bad for race testing). A review probe also found that WebRTC STUN UDP bypasses HTTP-level guards.
- **Decision:**
  - Every guarded context gets a dead local proxy (`proxy.server` on `127.0.0.1` port 0) with a bypass list of loopback plus `allowedHosts`. Any hop to a non-allowlisted host therefore fails at the network layer.
  - The bypass list starts with `<-loopback>`, which subtracts Chromium's implicit bypass of all loopback and link-local addresses (`127/8`, `::1`, `169.254/16`, `fe80::/10`). Without it a redirect reached `169.254.169.254` directly. It must come first: bypass rules are last-match-wins, so the allowlisted hosts after it still bypass.
  - Allowed requests use `route.continue()` (no buffering). Blocks on redirect hops are reported through `requestfailed`: as `host` only when the failure is `ERR_PROXY_CONNECTION_FAILED` or `ERR_BLOCKED_BY_CLIENT`, otherwise as `leak` (the guard can't confirm the block; F06 treats it as a safety failure).
  - The guard aborts or closes first, then calls `onBlocked`; a throwing `onBlocked` is swallowed so it can't stall a request or crash the runner.
  - Browsers launch with `guardLaunchOptions()` (`--force-webrtc-ip-handling-policy=disable_non_proxied_udp`), and an init script disables `RTCPeerConnection`.
  - `newGuardedContext(browser, opts, extra?)` is the single entry point. It rejects caller `proxy` and `serviceWorkers` overrides.
- **Consequences:** F06 must launch Chromium with `guardLaunchOptions()` and create every context with `newGuardedContext`. This refines (does not supersede) the guard bullet of D-17.

### D-19: One health gate, run after every implementation and in CI
- **Context:** the user asked (2026-10-30) for a single health command, CI on GitHub, and a rule that every agent checks health after each implementation so no regressions slip in.
- **Decision:**
  - `npm run health` = `npm run typecheck && npm run lint && npm test`. It is the single definition of "green".
  - Every session and subagent runs it after each implementation step and before reporting, committing, merging or handing off (AGENTS.md "Health check"). Red means not done. Tests, lint rules and type checks are never weakened to turn it green.
  - GitHub Actions (`.github/workflows/ci.yml`) runs `npm run health` on Node 22 for every push to `main` and every pull request, after `npx playwright-core install --with-deps chromium`.
- **Consequences:**
  - New checks (for example a formatter, or the Candy Swap smoke haunting with cached plans from STACK.md) are added *inside* `npm run health` so local runs and CI stay identical.
  - CI needs no secrets today. Any future job that needs an LLM key must not run on pull requests from forks.

### D-20: Route Scout rules (F03)
- **Context:** F03 grilled on 2026-10-30. Candy Swap (F10) doesn't exist yet, and account config had no way to say where the login fields are.
- **Decision:**
  - **Fixture first:** F03 is built and tested against a tests-only `node:http` fixture app shaped like Candy Swap (login page, "Claim" buttons, trade form). The real Candy Swap check reruns when F10 lands.
  - **Login:** heuristic by default (username/email field, password field, log-in/sign-in/submit button on `loginRoute`). An optional `fields: { username?, password?, submit? }` per account overrides it with D-15 targets (`{role,name}`, `{label}`, `{text}`, `{testId}`). Login succeeds when the page leaves `loginRoute` or no password field remains. Login has its own 10 s budget.
  - **Contexts:** one guarded context per identity, opened one at a time: anonymous (for `auth:false` routes) first, then each account in order of first use. Contexts come only from `newGuardedContext` (D-18). The caller launches Chromium with `guardLaunchOptions()`.
  - **storageState:** Scout returns each account's `storageState` **in memory only**. It is never written to disk (session cookies are secrets, and replay doesn't need them). F06 reuses it (KI-10).
  - **Read-only:** Scout only fills and submits login forms. No discovery clicking, and it never runs `resetCommand`.
  - **Capture:** `load`, then try `networkidle` within the 10 s route budget (a timeout means `settled:false`, not failure). The snapshot is Playwright's `ariaSnapshot()` of `body`. Interactive elements `{role,name,label?,testId?}` are parsed from it. `testId` and `label` come from extra Playwright locator queries, not a custom tree walker.
  - **Statuses:** `ok | redirected | unreachable | authFailed`, each with a reason. Only `ok` and `redirected` keep a snapshot. A failed login marks all of that account's routes `authFailed` without visiting them.
  - **Trim:** about 4k tokens per route (chars/4). Interactive list capped at 200 entries. Snapshot text nodes collapsed to 80 chars, then cut on whole lines with a `… [trimmed]` marker. `snapshotFull` is kept in the file for debugging and replay. Snapshot text is redacted with the config's `Redactor` before it is written.
  - **Hash:** one hash per route over the status and the sorted interactive list only (stable across dynamic text). F05 combines the hashes of the routes it uses. A run-level `scoutHash` over all routes is returned for `run.json`.
  - **API:** `scout(browser, loaded, { outDir, onRoute? })` writes `outDir/scout/<slug>.json` (`/` → `index`, `/trade/new` → `trade__new`). The run folder and runId belong to the caller.
- **Consequences:**
  - F02's account schema gains the optional `fields`. `TargetSchema` lives in `src/config/schema.ts` until F05's DSL reuses it.
  - "Single context" in the PRD now means one context at a time.
  - Routes reachable only through clicks (modals, tabs) aren't scouted. Dynamic routes (`/candy/:id`) need a concrete path in config.

### D-21: Route Scout implementation rulings (F03)
- **Context:** while implementing and reviewing F03 (2026-10-30), several choices beyond D-20 came up. D-20 stays as written; this entry complements it.
- **Decision:**
  - **Origin-only target:** `target` must be an origin only (no path, query or hash). The schema enforces it, because base-path targets broke path comparisons and login detection. A malformed target is a schema failure and never a raw error.
  - **Emitted targets must resolve:** an emitted `label` exists only when exact `getByLabel` resolves exactly one element (the same resolution as `locateTarget`). A testId whose value changes under redaction is dropped. testId lookups use a 250 ms timeout and are skipped on failure.
  - **Budget:** the interactive JSON is trimmed from the end to at most 75% of `TRIM_CHARS`. The snapshot is then fitted by JSON-escaped length (`fitSnapshot`).
  - **Per-route budget:** `routeTimeoutMs` is a hard cap. Capture's 20% share is reserved up front. After a capture timeout the page is replaced with a fresh one in the same context (cookies kept).
  - **No summary file:** nothing is written in `scout/` besides route files. `scout/index.json` is the `/` route. `scoutHash` is returned, and writing `run.json` is the caller's job.
  - **Ordering:** `onRoute` fires in visit order (anonymous identity first, then accounts). `result.routes` is in config order.
  - **Login and hashes:** session-lost detection uses exact pathname equality with `loginRoute` (`isLoginPath`). `routeHash` includes `count`, so duplicate names change the hash.
  - **Redaction:** `finalPath` and blocked URLs are redacted.
- **Consequences:**
  - F05 targets rely on these guarantees: every emitted `label` and `testId` resolves, and snapshots fit the budget.
  - Sub-path apps need to be served at an origin (for example through a proxy).
  - The deferred review minors are in KI-22.

### D-22: The guard reports hidden redirect hops with reason `redirect` (extends D-18)
- **Context:** KI-23. Under CPU load, Chromium sometimes reports a redirect hop stopped by the dead proxy only as a `requestfailed` on the original allowlisted request (`net::ERR_PROXY_CONNECTION_FAILED`), with no request for the hop. The guard ignored failures on allowlisted hosts, so a stopped third-party redirect went unreported and CI on `main` went red. The user chose this option on 2026-10-31.
- **Decision:**
  - `BlockReason` gains `redirect`. An allowlisted request that fails with `net::ERR_PROXY_CONNECTION_FAILED` is reported with that reason. Its `url` and `host` are the original request's. The hop's target is unknown.
  - It means "blocked", not "leak": allowlisted hosts bypass the dead proxy, so only a redirect hop can produce that error.
  - Any other failure on an allowlisted host is still not reported.
  - Tests treat a stopped redirect as exactly one report: the hop (`host`) or the original request (`redirect`).
- **Consequences:**
  - F06 and the report must show `redirect` as a blocked redirect from that URL to an unknown off-allowlist target, not as an app error or a leak.
  - If the hop's target is ever needed (for example to name the third-party host in a report), it has to come from somewhere else, such as the CDP `Network` events. That was considered and left out for now.

### D-23: Target the Costume Contest category (supersedes D-02)
- **Context:** the hackathon started on 2026-10-31. The user chose to theme Poltergeist for the Costume Contest ("any app with a haunting, polished UI" in the 2025 rules) rather than Frankenstein.
- **Decision:**
  - Costume Contest is the primary category.
  - The product still stitches many technologies together, so Frankenstein remains the fallback if 2026 tracks change.
  - Bonus prizes are still in play (Most Creative, Blog Post, Social).
- **Consequences:**
  - The look is now a High priority, not polish: F26 Costume Kit (D-26), THEME.md (D-24).
  - Re-check against the published 2026 tracks (KI-05).

### D-24: The costume is a haunted terminal
- **Context:** the user wants ASCII art in the spirit of Reanimator's dithered "opening" prototypes, while staying recognisably a separate entry.
- **Decision:**
  - Everything visual is drawn as ASCII glyphs. Images and frames go through a 4×4 Bayer ordered dither into the ramp `" .:-=+*#%@"`.
  - **Ectoplasm green (`#7dffb0`) is for ghosts only.** Red, amber and grey are for verdicts only. The target app is drawn monochrome.
  - Real text (criteria, steps, numbers) stays real text. A "real frame" toggle shows the actual screenshot.
  - The typeface is JetBrains Mono.
  - No light mode, emoji, gradients or rounded SaaS cards.
  - No Reanimator assets, dot style, purple or necromancer story.
- **Consequences:**
  - Every surface follows [THEME.md](THEME.md): the CLI, the report, the Séance, replay and the video.
  - New risks: KI-25 (render performance) and KI-26 (readability after video compression).

### D-25: Fresh start in a new repo, rebuilt from the docs
- **Context:** the prototype (now `../poltergeist-old`, private GitHub repo) built F01–F03 before the hacking window. The 2026 rules reportedly count only new projects (KI-05, KI-15). The user asked (2026-10-31) to rename the prototype and start a fresh repo from rewritten docs.
- **Decision:**
  - **New repo, new history**, with the first commit inside the hacking window. The prototype stays private and untouched as `../poltergeist-old`.
  - **Docs carry over, code doesn't.** Decisions, issues and lessons were rewritten here. Source files, tests and implementation plans are **not** copied or ported. Every feature is rebuilt through the grill → plan → implement → review cycle. Agents must not open `../poltergeist-old/packages/` while implementing.
  - **`.kiro/` is real now** (this is the main project). The spec moved from `docs/SPEC.md` into `.kiro/specs/poltergeist/` (requirements, design, tasks) in Kiro's format, with steering in `.kiro/steering/`. Criterion IDs are `N.M` (D-16), so F01 can read its own spec.
  - **Build order changes** (PRD): F10 Candy Swap is built in Kiro before F03, so Scout is tested on the real app (this replaces D-20's "fixture first"). A KI-01 spike runs before F05.
- **Consequences:**
  - SPEC requirement numbers changed from `R1.2` to `1.2`. The PRD cites "Requirement N".
  - The write-up should say openly that the idea was prototyped before the window and rebuilt from scratch (KI-24).

### D-26: The Costume Kit is its own package and a High feature
- **Decision:**
  - `@poltergeist/costume` owns the palette, the glyph renderer, the wordmark, the sprites, the verdict glyphs, possession and exorcism, and the real-frame toggle (F26, High).
  - F12 owns only the Séance layout and data.
  - F22 (Low) keeps only sound, trails and idle motion.
- **Why:** the costume is now the category we compete in, and the CLI, report and Séance must share one look without depending on each other.


### D-27: Spec Reader edge cases and API (F01, extends D-16)
- **Context:** grilling F01 for the rebuild (2026-10-31). LESSONS § F01 and KI-16 listed edge cases the prototype deferred. The user asked to accept the recommended answers.
- **Decision:**
  - **API:** `parseSpec(specDir): Promise<{criteria, warnings}>` reads `<specDir>/requirements.md` and throws `SpecNotFoundError` if it is missing or unreadable. The pure `parseRequirements(markdown): {criteria, warnings}` never throws. Both live in `packages/core/src/spec/`.
  - **Warnings** are `{code, message, line?}` with codes `empty-spec`, `no-criteria`, `ignored-list`, `unrecognized-heading`, `duplicate-requirement` and `no-requirement-headings`.
  - **More than 26 duplicates:** suffixes continue spreadsheet-style (`b`…`z`, `aa`, `ab`…). There is no cap.
  - **`Requirement 1a`** (or any number followed by letters) is not a requirement heading. It produces an `unrecognized-heading` warning instead of being read as `1`.
  - **Code blocks and tables inside a criterion** are part of its plain text (so they're hashed), and `raw` keeps the source.
  - **EARS keywords** must be followed by whitespace or a comma, so `IF-Match` is not IF.
  - **Subject:** `subject` is the text after the last upper-case `THE` before the first SHALL, inside the final clause, so `THE checkout page of the store` keeps its whole subject. If there's no upper-case THE, the last `the` in any case is used, so a lowercase `the` with no comma still splits (refined after the F01 review).
  - **Heading titles** may follow the number with no separator (`Requirement 3 Login`), because D-16's separators are optional. The number must still end at a non-word character, so `1a` stays unrecognized (refined after the F01 review).
  - **Hard line breaks** (two trailing spaces, or a trailing backslash) inside a criterion become a space in its text, so words never run together.
  - **Blockquoted specs** are not supported. Lists inside a blockquote are not criteria, so the requirement gets a `no-criteria` warning.
  - The scaffold (build order 0) is delivered in the same cycle as F01, as the first tasks of its plan.
- **Consequences:** this resolves the deferred minors in KI-16. KI-16 itself stays open until a fresh Kiro-generated spec is added as a fixture (F10).

### D-28: `main` is protected by a ruleset; everything lands through PRs
- **Context:** GitHub flagged `main` as unprotected after the first PR (2026-10-31). The user asked for a ruleset set up with `gh api`.
- **Decision:** the repository ruleset "Protect main" (id 26265302) targets the default branch.
  - It blocks deletion and force pushes.
  - It requires a pull request with 0 approvals (a solo maintainer can't approve their own PR).
  - It requires the `health` check from GitHub Actions to pass on an up-to-date branch.
  - Repository admins can bypass it, but only through a pull request.
- **Consequences:**
  - Sessions never push to `main`. They push a feature branch and open a PR, and CI's `health` must be green before merging (this enforces D-19).
  - Raise the required approvals to 1 if teammates join.
  - If the CI job is renamed, update the required check in the ruleset in the same change.
