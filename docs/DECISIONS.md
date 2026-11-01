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
| D-29 | F02 rebuild rulings (extends D-17, D-18, D-22): KI-21 folded in, internal bypass list, decoded `forbidden` paths, userinfo targets rejected, unresolved unused accounts dropped, reset resolves on `exit` | Accepted |
| D-30 | F03 rebuild rulings (extends D-20, D-21): fixture-first until F10 lands, KI-22 folded in, stricter login success with fail-fast and a quiet in-place check, one file per identity for repeated paths, JSON-escaped secrets redacted, testId attach-or-list, HTTP ≥ 400 is `unreachable`, measured trim invariant, sha256 hashes, slug collision suffix | Accepted |
| D-31 | F04 persona and generator rulings: registry-derived ids, sprite reference, plain-QA `behaviour`, `STEP_TYPES` in F04, eight generators incl. `plain`, uint32 seed/index, BLNS minus ten injection/vulnerability sections | Accepted |
| D-32 | F05 compiler rulings (extends D-03, D-04, D-15): fixture-first before the spike, no DSL `literal`, deterministic route picking, compiler-stamped plan fields, two-pass validation, injected `LlmClient`, cache key incl. persona hash | Accepted |
| D-33 | F06 runner rulings (extends D-06, D-18, D-22): fixture-first, injected browser, raw per-rep results for F07, conflict-key scheduling instead of seed partitioning, shared-session Doppelgänger, same inputs every rep, rendezvous barrier, context-route holds, leak aborts the run, overlay in a closed shadow root, login traces dropped | Accepted |
| D-34 | F07 verdict rulings (extends D-06): pure `computeVerdicts`, N = requested reps, same assertion = plan index, only `failure: 'app'` counts, forbidden blocks void a rep, `clean` needs ⌈2N/3⌉ clean reps, `uncompilable` rolls up as `inconclusive`, KI-37 timeout/attribution fixes folded in | Accepted |
| D-35 | F08 report rulings (extends D-14): pure render + atomic two-file write, fix-ready haunted tasks, 300-line hard cap with JSON overflow, versioned JSON schema, draft wordmark and glyphs in core until F26, fixture-first Done-when | Accepted |
| D-36 | F09 CLI rulings (extends D-17, D-35): fixture-first until F10/F26, `summon()` in core with a thin `@poltergeist/cli`, `parseArgs` flags, exit 0/1/2/130, run folder next to the config, live ghost block only on a colour TTY, loopback `--seance` event server with replay, KI-35/KI-41 fold-ins | Accepted |

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

### D-29: F02 rebuild rulings (extends D-17, D-18, D-22)
- **Context:** grilling F02 for the rebuild (2026-10-31). LESSONS § F02, KI-17, KI-19 to KI-22 listed items the prototype deferred. The user asked to accept the recommended answers.
- **Decision:**
  - **KI-21 in the first pass:** reset output is redacted *before* it is trimmed to 64 KB, `runReset` takes the loader's `env`, validation issue paths are redacted as well as messages, `forbidden` rules are precompiled once per rule list, and `BlockedRequest` carries the browser's `errorText` when there is one. All KI-21 test gaps are written in this cycle.
  - **Bypass list is internal:** the proxy bypass builder is not exported. `newGuardedContext` re-validates every host it puts in the bypass list (no `,`, `;`, `<`, `*` other than a leading `*.`, whitespace) and throws on a bad entry. IPv6 entries are checked with `net.isIPv6`, not a regex.
  - **`forbidden` paths (KI-17, half):** the pathname is percent-decoded once before matching. If decoding fails, the raw pathname is matched. Matching stays case-sensitive. `forbidden` on redirect hops to allowlisted hosts is still not enforced (the guard can't see those hops without CDP); that half of KI-17 stays open for F17.
  - **Targets (KI-22):** a `target` with userinfo (`http://u:p@host`, `http://localhost@evil.com`) is rejected. Hostnames are not normalised, so a trailing-dot host such as `localhost.` is not on the allowlist: it is refused at load and blocked by the guard (fails closed).
  - **Unused accounts (KI-20):** an account whose `env:NAME` password is unset or empty and that no route uses is dropped from the loaded accounts with an `unresolved-secret` warning. A literal `env:NAME` string never survives as a password. A route-used account with an unset variable is still a `ConfigError`.
  - **Reset (KI-19):** `runReset` resolves on the child's `exit`, then stops reading the pipes. It kills the process group only on timeout. `resetCommand` must not start long-lived servers (documented).
  - **Redaction:** the `Redactor` also scrubs each secret's `encodeURIComponent` form.
  - **Layout:** `packages/core/src/config/` (schema, errors, load, redact, reset) and `packages/core/src/safety/` (allowlist, forbidden, guard, limiter). Browser tests use a local `node:http` fixture and never touch the internet. CI installs Chromium. `npm run test:guard:1cpu` runs the guard tests pinned to one CPU (Done-when), outside `health`.
  - **Left to F06:** worker WebSockets and `about:blank` popups (KI-18).
- **Consequences:** KI-19, KI-20 and KI-21 are resolved by F02; KI-17 stays open for redirect hops only. F06 can rely on `LoadedConfig.accounts` containing only usable accounts.

### D-30: F03 rebuild rulings (extends D-20, D-21)
- **Context:** grilling F03 for the rebuild (2026-10-31). F10 (Candy Swap) is built in Kiro by the team and doesn't exist yet, but F03's Done-when names the real app. LESSONS § F03 and KI-22 listed items the prototype deferred. The user asked to accept the recommended answers.
- **Decision:**
  - **Fixture first (this cycle only):** F03 is built and tested against a tests-only `node:http` app shaped like Candy Swap (`packages/core/test/scout/candy-fixture.ts`). This re-instates D-20's fixture bullet until F10 lands; the real Candy Swap Done-when check is tracked in KI-30.
  - **KI-22 in the first pass:** every item in LESSONS § F03 "Do these in the first pass" is built in this cycle.
  - **Login success:** a login page answering HTTP ≥ 400 fails at once. Scout waits (within the budget) for the password field to be visible, for forms rendered after load. After submit, login succeeds when no visible password field remains **and** the page is off the `loginRoute` subtree (`/login`, `/login/…`), or, for an in-place SPA login, stays exactly on `loginRoute` with no password field, no alert and no request in flight for 500 ms (so a spinner that hides the form isn't taken for success). It fails fast, after a 500 ms grace, once a page load happened or a `role=alert` is visible without success. Only Playwright's `TimeoutError` counts as a timeout. `fields` overrides must `count() === 1`, otherwise a specific reason is given at once. Reasons are redacted. Session-lost detection on routes stays exact pathname equality (D-21).
  - **Capture:** elements are parsed from the unredacted `ariaSnapshot()`; any element whose name changes under redaction is dropped. A label is emitted only when exact `getByLabel` resolves exactly one element. testIds are looked up concurrently (per-id try/catch, 250 ms). Duplicate or redaction-changed testIds are dropped. A testId on a unique interactive element is attached to it; every other resolving testId goes to a separate `testIds` list.
  - **Statuses:** a failed `goto` or an HTTP status ≥ 400 is `unreachable`. A capture failure is `unreachable` with `capture failed: …`, and the next route gets a fresh page in the same context.
  - **Trim:** `TRIM_CHARS = 16000`. The invariant `JSON.stringify({interactive, testIds, snapshot}).length <= TRIM_CHARS` is measured (no hard-coded key overhead). Lists ≤ 200 entries and ≤ 75%. Long names and text are collapsed on decoded values and re-encoded, so a cut never lands mid-escape.
  - **Hashes and slugs:** sha256 over canonical JSON, 16 hex. `routeHash` covers status, interactive elements (with `count`) and testIds. A path configured under two identities gets one file per identity (`market_anonymous`, `market_default`). Paths whose slugs still collide all get `-<first 6 hex of sha256(key)>`.
  - **Redaction (extends D-29):** the `Redactor` also scrubs each secret's JSON-escaped form, because aria snapshots quote names. testIds whose element name holds a secret are dropped like interactive entries.
  - **API:** `scout(browser, loaded, { outDir, routeTimeoutMs?, loginTimeoutMs?, onRoute?, onBlocked? })` → `{ routes, scoutHash, sessions }` in `packages/core/src/scout/`.
- **Consequences:** F03 is marked Done for the fixture only until KI-30 is closed. F05 can rely on every emitted label and testId resolving, and on `testIds` for non-interactive targets (status messages).
### D-31: F04 persona and generator rulings (extends D-04, D-13)
- **Context:** grilling F04 (2026-10-31). The user asked to accept the recommended answers.
- **Decision:**
  - **Ids:** `PersonaId` comes from the registry (`wraith`, `banshee`, `doppelganger` today). F16 and F20 add entries; no id exists without a definition. Unknown ids (including `__proto__`, `toString`, wrong case) throw `UnknownPersonaError` / `UnknownGeneratorError`.
  - **Fields:** `name` and `tagline` are UI copy and may be themed. `behaviour` and each generator's `description` go into prompts, so they use plain QA wording; a test fails on theme words (D-09). `sprite` is a string key the Costume Kit resolves (today the persona id). F26 owns the art.
  - **Step vocabulary:** `STEP_TYPES` (the 14 steps of design §6) lives in `core/personas`. F05 builds its DSL zod enum from it.
  - **Generators:** `plain`, `naughty`, `emoji`, `rtl`, `long` (exactly 10,000 chars), `empty`, `whitespace`, `fastcheck` (fast-check 4.10.2, `string({unit:'grapheme', maxLength:64})`). `plain` is new: short ordinary alphanumeric values, so personas that need *valid* input still don't take values from the LLM.
  - **Determinism:** `generate(id, seed, index)` with seed and index uint32, otherwise `RangeError`. List generators pick `list[(mix32(seed) % n + index % n) % n]` (murmur3 fmix32), so consecutive indices don't repeat until the list wraps. A committed vitest snapshot (8 generators × 3 seeds × 5 indices) fails on any drift, including dependency bumps.
  - **Naughty strings:** BLNS `blns.txt` is vendored verbatim at commit `db33ec7` with its MIT licence (`src/personas/generators/data/`). Ten sections are excluded as exploit payloads (Script, SQL, Server Code, Command (Ruby), XXE and jinja2 injection, File Inclusion, Known CVEs, Terminal escape codes, iOS Vulnerabilities), per D-08 and the scrapped F25. 241 strings remain. Kept on purpose: `Human injection` (harmless prose) and `Unwanted Interpolation` (format-string text such as `%n` and `${HOME}`, which shows up as display bugs, not exploits). The final review caught the jinja2 section, which had been missed.
  - **Allocations:** Wraith `goto click dblclick fill press back reload wait` + `plain`, 1 actor. Banshee `goto click fill press wait` + all generators except `plain`, 1 actor. Doppelgänger `goto click fill press reload wait barrier holdRequests releaseRequests` + `plain`, 2 actors. `throttle`, `login` and `logout` are left to F16.
  - **Data:** all persona and generator data is deep-frozen.
- **Consequences:** F05 imports `STEP_TYPES`, `PERSONA_IDS` and `GENERATOR_IDS` for its schema and shows `behaviour` and descriptions in the prompt. Whether DSL `literal` inputs survive is open (KI-32). Steering flags (Req 4.3) remain F17.

### D-32: F05 compiler rulings (extends D-03, D-04, D-15)
- **Context:** grilling F05 (2026-10-31). F10 (Candy Swap) and the KI-01 spike don't exist yet, and no API key is available in dev sessions. The user asked to accept the recommended answers.
- **Decision:**
  - **Order:** F05 is built before the KI-01 spike, fixture-first like D-30. Health tests use a fake `LlmClient`. The spike is re-scoped to run F05's real compiler (less throwaway code) once F10, F06 and an API key exist. The live "≥ 80% valid" Done-when check is tracked in KI-34. KI-01 stays an open Blocker until the spike passes.
  - **No `literal` (KI-32):** `fill.input` is only `{generator}`, restricted to the persona's generators. The LLM never writes an input value (D-04).
  - **Route picking (KI-03):** deterministic, no LLM pass. Each `ok` scouted route is scored by stop-word-filtered token overlap between the criterion (text and EARS clauses) and the route's path, title, element names, labels and testIds. The top 2 with score > 0 are picked, ties in config order. No match → the criterion's pairs are `uncompilable` (`no matching route`) without an LLM call.
  - **Plan fields:** the LLM writes only `intent`, `actors` and `assert` (or `notApplicable` + `reason`). The compiler stamps `criterion`, `persona`, `routes` and each route's scout `identity`.
  - **Validation:** structural zod (built from `STEP_TYPES`, `GENERATOR_IDS`; design §6 single-key steps) then semantic checks: persona steps and generators, actor count, Scout-emitted targets on the picked routes only, `goto` only to picked routes, every barrier reached by every actor, every `holdRequests` released, `wait` ≤ 2000, `press` from a key enum, relative `api` paths. Any error triggers the one retry with the errors fed back.
  - **LLM boundary:** the zod schema is the single definition, converted to JSON Schema for structured output; our validation always re-runs. The call sits behind an injected `LlmClient` (Anthropic now, Bedrock in F19, a fake in tests).
  - **Failures:** an authentication or permission error from the provider aborts the compile with `CompilerError` (exit code 2). The SDK resolves credentials beyond `ANTHROPIC_API_KEY` (auth tokens, `ant auth login` profiles), so there's no up-front key check; a run that's all cache hits never constructs a client. A per-call API failure (after the SDK's retries) or a refusal (KI-11) marks the pair `uncompilable` with a reason and is never cached.
  - **Cache:** key = sha256 over criterion hash, persona id, persona-definition hash, the picked routes' sorted `routeHash`es, model and `PROMPT_VERSION`. Stored at `.poltergeist/cache/plans/<key>.json`; valid plans and `notApplicable` only.
  - **API:** `compile(criteria, scout, { client, model, cacheDir, outDir?, personas?, concurrency = 4, onPlan? })`, pairs through `createLimiter` (≤ 4), writes `plans/<criterion>__<persona>.json` when `outDir` is set, returns per-pair results plus call and cache-hit counts.
  - **Implementation notes (2026-10-31):** structured output goes through `messages.create` with `zodOutputFormat(LlmOutputSchema)`'s `{type, schema}`, not `messages.parse`, which throws on a schema mismatch and would lose the text the retry replays. The DSL target types are exported as `PlanTarget`/`PlanTargetSchema` (config already owns `Target`). No server-side refusal `fallbacks`: a fallback model's plan would be cached under the wrong model.
  - **Review fixes (2026-10-31):** cache hits are re-stamped with the current criterion id and persona (the key covers text, not id). The first `CompilerError` stops queued pairs (no further calls, writes or `onPlan`). Errors raised before any request (for example no credentials) also abort with `CompilerError`. Every actor must meet shared barriers in the same order, or the runner would deadlock.
  - **Prompt:** plain QA (D-09): system = "edge-case end-to-end test generation for an app the user owns", DSL and target rules; user = criterion, persona behaviour, allowed steps, generator descriptions, picked routes' scout data. A test fails on theme words.
- **Consequences:** F06 reads `identity` per route from the plan. Typed generators (number, email, date) are F04-scope follow-ups (KI-32). F05 is Done for the fixture only until KI-34 closes.

### D-33: F06 runner rulings (extends D-06, D-18, D-22)
- **Context:** grilling F06 (2026-11-01). F10 (Candy Swap), the KI-01 spike and an API key don't exist yet. The user asked to accept the recommended answers.
- **Decision:**
  - **Order:** F06 is built fixture-first like D-30/D-32, against the Candy fixture extended with a naive check-then-insert claim endpoint (KI-07). The "12 ghosts on real Candy Swap in < 5 min" Done-when is tracked in KI-36.
  - **API:** `runPlans(browser, loaded, plans, { sessions, outDir?, reps?, seed?, frameFps?, signal?, onEvent? })` → `RunResult` in `packages/core/src/runner/`. The caller launches Chromium with `guardLaunchOptions()`. F06 emits events through `onEvent` and appends `events.ndjson`; the WebSocket transport, `run.started` and `run.finished` belong to F09/F12.
  - **Raw results (for F07):** one record per pair × rep with `outcome: completed | timeout | planError | systemError`, step outcomes `ok | failed | blocked-by-rule | timeout`, assertion results, blocked requests and artifact paths. F06 never decides `haunted` or `clean`.
  - **Reps and reset (KI-13):** reps run one after another, `runReset` before each; a failed reset makes every pair of that rep `systemError`. Inside a rep, plans run through `createLimiter(concurrency)` counted per context (a Doppelgänger takes 2 slots). Plans that share a **conflict key** (route path + a click, dblclick or fill target) never run at the same time. Seed partitioning needs app cooperation and is deferred.
  - **Identity (KI-10, KI-35):** every actor gets its own `newGuardedContext` seeded with the scout `storageState` of the plan's first non-anonymous route identity, so both Doppelgänger actors share one session. Two different accounts in one plan → `planError`. `login {account}` reuses scout's `login()`; `logout` clears cookies and storage.
  - **Steps:** all DSL steps. Targets resolve through scout's `locateTarget`, `.first()` when several match (noted on the step). `fill` values come from `generate(generator, seed, index)` with a seed derived from (run seed, criterion, persona) and the fill ordinal, so every rep gets the same inputs (D-06). `throttle` uses CDP `Network.emulateNetworkConditions` with the DevTools slow/fast 3G presets.
  - **Barrier and holds:** an in-process rendezvous that records each actor's release time; an actor that ends early breaks the barrier and releases the others. `holdRequests "M /p"` installs a context route after the guard's (so it runs first) that parks matching method + exact pathname requests and hands them to the guard with `route.fallback()` on release; anything still held is released when the actor ends.
  - **Timeouts:** actions 5 s. Barrier waits and assertions count against the 60 s plan budget only. Assertions run after every actor is done; text, count and URL assertions poll for up to 2 s.
  - **Guard:** `forbidden` marks the actor's current step `blocked-by-rule` and the actor carries on; `host`, `scheme` and `redirect` are recorded and emitted, not failures; `leak` aborts the whole run with `RunnerSafetyError`. `noConsoleErrors` ignores errors caused by guard-blocked loads.
  - **Assertions:** `api` runs through actor a's `context.request` after an explicit allowlist and `forbidden` check (the request context skips route handlers). `jsonPath` is a subset (`$`, `.key`, `[n]`, `.length`). `urlMatches` is a pathname glob with `*`.
  - **Ghost cursor (Req 6.6):** an init-script overlay in a closed shadow root, `aria-hidden`, no text, `pointer-events: none`, ectoplasm green (D-24), moved to the target's centre before each action.
  - **Frames:** a CDP screencast dropped to ≤ `frameFps` (default 4, 0 = off), emitted as `ghost.frame` and written to `frames/<ghostId>/<seq>.jpg`, never to ndjson.
  - **Artifacts and secrets (Req 2.8):** tracing on every context, kept only for failed reps as `artifacts/<criterion>__<persona>__rep<k>/trace-<actor>.zip`, plus `screenshot-<actor>.png` on failed assertions. A trace can't be redacted, so an actor that ran a `login` step has its trace dropped with a note.
  - **Events:** `rep.started`, `reset.finished`, `ghost.spawned`, `ghost.step`, `ghost.frame`, `guard.blocked`, `assert.result`, `rep.finished`, each with `t`; URLs and messages pass through the Redactor.
  - **Folded in:** KI-29's provider keys stripped from the reset env and guard tests moved off `example.com`.
- **Implementation notes (2026-11-01):** the scheduler (`runScheduled`) replaces `createLimiter` for runs because it must count slots per context and honour conflict keys; it enforces the same cap (D-07). A guard report is attributed to the actor's latest *action* step (goto, click, dblclick, fill, press, back, reload, login, logout), because reports arrive after the click that caused them, often during a following `wait`. A leak aborts through a signal each actor checks before its next step; contexts are not force-closed from the guard callback, which raced Playwright's dispatch ("object was not bound"). Provider keys (`ANTHROPIC_*`, `DOPPLER_TOKEN`, `AWS_*` credentials) are stripped from the reset env.
- **Review fixes (2026-11-01):** no trace is recorded for an actor whose context starts from a scout session, because Playwright traces hold the `storageState` and every `Cookie` header (D-20); actors that run a `login` step are marked before the call. `textVisible`/`textNotVisible` match **case-sensitively on whole words** (`Error` doesn't match "No errors", `1 claimed` doesn't match "11 claimed"), so wording alone never makes a reproducible false `haunted`; F05's prompt should say so when it's next revised. `api` assertions don't follow redirects (a 3xx is the status), so a hop can't reach a `forbidden` path. `noConsoleErrors` ignores only console errors located at a URL the guard blocked. Events are redacted value by value, never as a serialized line. The plan-timeout timers are cleared, so nothing outlives `runPlans`.
- **Consequences:** design §8 gains `rep.started`, `reset.finished` and `rep.finished`; design §9 names per-actor artifacts. F07 consumes `RunResult`. F09 launches the browser, calls `scout`, `compile` and `runPlans`, and owns `run.json`.

### D-34: F07 verdict rulings (extends D-06)
- **Context:** grilling F07 (2026-11-01). F06 hands over raw per-rep results (D-33); F05 hands over per-pair compile statuses. The user asked to accept the recommended answers.
- **Decision:**
  - **API:** `computeVerdicts(pairs: PairResult[], run: RunResult)` → `{ reps, threshold, pairs, criteria, counts }` in `packages/core/src/verdicts/`. A pure function: no I/O, no events, deterministic and independent of result order. F09 writes `verdicts.json` and emits `verdict.pair` / `verdict.criterion`; F14 reads the file back.
  - **N and threshold:** N = `run.reps` (requested, not completed); threshold = ⌈2N/3⌉. At N = 1 any reproduced app failure is `haunted`.
  - **Same assertion:** the assertion's index in the plan. Plans and inputs are identical every rep (D-33), so the index is stable.
  - **What counts:** only an assertion with `ok: false` and `failure: 'app'` in a `completed` rep. `failure: 'plan'`, `'blocked'` or missing, and rep outcomes `planError`, `systemError`, `timeout` (a step timeout can't be told from a wrong target) make the rep inconclusive, never a bug (D-06).
  - **Forbidden blocks:** a rep with a `forbidden` guard report or a `blocked-by-rule` step has its app failures discarded and counts as inconclusive, because the user's own rule caused them. `host` and `redirect` reports are noted only.
  - **Pair verdicts:** `haunted` when one assertion index fails ≥ threshold reps; else `flaky` when any app failure counted (even if other reps were system errors; the reason says how many completed); else `clean` when ≥ threshold reps completed with every assertion passing; else `inconclusive`. Compile statuses pass through: `notApplicable`, `uncompilable`. A compiled pair with no run results is `inconclusive` ("not run"). A run result for a pair that was never compiled throws `TypeError`.
  - **Rollup (Req 7.4):** worst pair by `haunted` > `flaky` > `inconclusive` > `clean`, ignoring `notApplicable`; `uncompilable` counts as `inconclusive`. All pairs `notApplicable` → `notApplicable`. Criteria keep first-seen input order.
  - **Record:** each pair carries `verdict`, a plain one-line `reason` (no theme words; F08 owns wording), per-assertion failure counts with the last failing detail, `failingAssertion` (lowest index with the highest count), `failedReps`, rep `outcomes` counts, `evidence` (artifacts of reps with counted failures) and `notes`.
  - **Tests:** table tests for every path plus fast-check properties (determinism, order independence, an extra app failure never lowers severity).
  - **Folded in from KI-37:** a plan timeout aborts the pair's actors through a per-pair signal and snapshots `steps`, with no `ghost.step` after it; a late guard report only upgrades a step from `ok`; the rep error prefers an actor whose end isn't a broken barrier.
- **Implementation notes (2026-11-01):** the in-flight step at a plan timeout is recorded as `timeout` ("plan exceeded N ms"), not the `failed` "Target page closed" the context close used to leave; upgrade-only attribution lives in `markBlockedByRule` (runner/actor.ts). `computeVerdicts` also throws on a duplicate input pair.
- **Consequences:** design §4 gains the verdict types; F08 renders `reason` and `evidence`; F14 diffs `verdicts.json` by `criterion` and `persona`.

### D-35: F08 report rulings (extends D-14)
- **Context:** grilling F08 (2026-11-01). F10 (Candy Swap), F26 (Costume Kit) and F09 don't exist yet. The user asked to accept the recommended answers. F08 was first built alongside a parallel F07; `main`'s F07 (PR #8, D-34) landed first and is the one F08 consumes.
- **Decision:**
  - **API:** `renderReport(input)` → `{ markdown, json }` is pure. `writeReport(specDir, rendered)` writes only `haunting-report.md` and `haunting-report.json`, each through a temp file and a rename, so every run regenerates them whole (Req 8.1, 8.3). Both are in `packages/core/src/report/`.
  - **Input:** the spec's criteria, `computeVerdicts`'s output (D-34), the compiled pairs (for plans), and run metadata `{ runId, runDir, target, reps, model, startedAt }`. Artifact paths are made relative to the spec folder with POSIX separators.
  - **Markdown order (THEME §5):**
    - the wordmark in a ```` ```text ```` block;
    - a counts line;
    - a board listing every criterion with its verdict glyph (`[  ]` for one that wasn't run);
    - one **fix-ready task** per haunted criterion (`[!!] 3.2 — <text>`), with the promise and its `requirements.md` line, then for each haunted persona: numbered steps in plain words (a `fill` names its generator, never a value), expected vs actual for each failing assertion, "failed k/N reps", and artifact paths;
    - a shorter section per flaky criterion;
    - one line per inconclusive or uncompilable pair, with its reason.
  - **Untrusted text** (criterion text, assertion details, app strings) is flattened to one line, capped at 200 characters, and wrapped in a backtick-safe code span where it's a value. The theme is only the header and glyphs. The facts stay in plain words.
  - **Size:** a hard cap of 300 lines. Over budget, content is dropped in this order: inconclusive lines, then flaky sections, then haunted sections from the end. A closing note points to `haunting-report.json`, which always has everything.
  - **JSON:** a versioned zod schema (`version: 1`), exported for F11's MCP tools. It holds run meta, counts, and criteria → pairs → evidence. It's deterministic: the only timestamps come from the input.
  - **Costume:** core holds the verdict glyph table and THEME §4's draft wordmark as defaults, and `renderReport` takes a `wordmark` override. When F26 lands, the CLI passes the Costume Kit's wordmark (KI-40).
  - **Done-when (fixture-first, like D-30/D-32/D-33):** a test runs the claims fixture's Doppelgänger race through `runPlans` → `decideVerdicts` → `renderReport`/`writeReport`. Then a fresh Claude Code subagent, given only the report, locates and reproduces the haunted criterion. The Kiro and real Candy Swap check is KI-38.
- **Implementation notes (2026-11-01):**
  - The JSON also records `truncated`: how many markdown items the cap dropped.
  - Each failing assertion keeps its `expected` text.
  - Single-actor plans label their steps "Steps:"; two-actor plans use "Actor a:" and "Actor b:".
  - At most 6 artifact paths per pair go in the markdown. The rest are in the JSON.
  - The artifact list says its paths are relative to the report's folder (from the agent check, KI-38).
  - `writeReport` writes the JSON before the markdown.
  - **On D-34's record:** "Actual" shows each failing assertion's failure count and its last detail; F07 keeps one detail per assertion, not one per rep. The pair's `failedReps` are listed. Artifacts come from `evidence`. The inconclusive line is F07's `reason` plus the first rep note (the error text).
- **Review fixes (2026-11-01):**
  - The 300-line cap never drops the first haunted section before the board. A hard cut with the JSON pointer is the last resort.
  - Pairs show `failed k/N reps (only r ran)` when reps are missing, plus a "Run notes" line (or an inline note when flaky) with F07's rep notes.
- **Consequences:** F09 calls `writeReport` after every run and prints its own board. F11's `get_haunting_report` reads the JSON schema.

### D-36: F09 CLI rulings (extends D-17, D-35)
- **Context:** grilling F09 (2026-11-01). F10 (Candy Swap) and F26 (Costume Kit) don't exist yet. The user asked to accept the recommended answers.
- **Decision:**
  - **Fixture-first** (like D-30, D-32–D-35): F09 is built and tested against the claims fixture with a fake `LlmClient`. The real `npm run summon` on Candy Swap from a clean clone is KI-42. Until F26 lands, the CLI uses core's `DRAFT_WORDMARK`, `VERDICT_GLYPHS` and persona initials (KI-40).
  - **Shape:** `summon(opts)` in `packages/core/src/summon/` orchestrates config → spec → scout → compile → run → verdicts → report, with an injected `llm`, browser launcher and `onEvent`, so F11 and F12 can reuse it (design §1). It returns `{ runId, runDir, verdicts, reportPaths, … }`. `packages/cli` (`@poltergeist/cli`, bin `poltergeist`) owns argument parsing, terminal output, exit codes and the WebSocket server. The bin runs TypeScript through tsx: no build step and no npm publish yet (KI-33 packaging stays open).
  - **Flags** (`node:util` `parseArgs`): `--spec <dir>` (required), `--config <path>`, `--only <ids>` (filter only; F14 adds the diff), `--personas <ids>` (validated and deduped), `--reps <1–10>`, `--recompile` (skips cache reads, still writes the cache), `--seance`, `--help`. An unknown flag, an unknown criterion or persona id, or a spec with zero selected criteria is a usage error.
  - **Exit codes:** 0 when nothing is haunted (flaky and inconclusive are listed but don't fail). 1 when any criterion is haunted. 2 on a usage error, `ConfigError`, `SpecNotFoundError`, `CompilerError`, `RunnerSafetyError`, a Chromium launch failure (with the install hint), port 6660 in use, any unexpected error, or a reset failure on every rep (the runner records reset failures as `systemError` reps instead of throwing, so this is how `ResetError` maps to 2; the report is still written). Ctrl-C aborts the run and exits 130 without writing a report.
  - **Run folder:** `.poltergeist/` next to the config file. `runId` is `YYYYMMDD-HHMMSS-xxxx` (UTC, random hex). F09 writes `run.json` (config snapshot, spec hash, `scoutHash`, model, options, timings) and `verdicts.json`, and appends `run.started`, `scout.route`, `plan.compiled`, `verdict.pair`, `verdict.criterion` and `run.finished` to the same `events.ndjson` through the runner's event sink.
  - **Terminal:** the wordmark and a one-line summary first. On a TTY with colour on, a live block with one line per active ghost (`W  wraith  3.2  r1  click`), the ghost part in `--ecto`, redrawn in place. With `NO_COLOR` set or no TTY, plain append-only phase lines and no animation. At the end, the board (verdict glyph, id, text clipped to the width; THEME colours as 24-bit ANSI), the counts and the report path.
  - **`--seance`:** a `ws` server on `127.0.0.1:6660` at `/runs/<runId>`, started only with the flag and before scouting. It broadcasts every event, frames included, and replays the buffered non-frame events to clients that join late. The Séance page itself (`:6661`) is F12's.
  - **Fold-ins:** KI-41 markdown injection and bidi/invisible escaping in the report (before F09 writes real reports). KI-35: cache and plan writes are best-effort, and duplicate persona ids are rejected. KI-37: a 2-actor plan at `concurrency: 1` gets a warning (the runner clamps).
  - **Done-when (fixture):** an in-process `main(argv, deps)` test runs `summon` end to end on the claims fixture with a fake LLM and checks exit 1, the board, the report and the run folder. Spawned-binary tests check `--help` and that a bad config exits 2.
- **Implementation notes (2026-11-01):**
  - `createEventSink` is generic over the event union, so `summon()` writes its events into the runner's `events.ndjson` (flushed before `runPlans` starts and after it ends, so lines never interleave).
  - `--personas` duplicates are dropped by `summon()`; `compile()` itself rejects them (`RangeError`).
  - `oneLine` now makes controls, bidi controls and invisible characters visible as `\uXXXX` everywhere (report and terminal), and a new `mdText` escapes markdown outside code spans.
  - The terminal shows one line per scouted route and one per rep. Without colour there are no per-step lines. On a colour TTY, `LiveBlock.log` prints phase lines above the live ghost block.
  - The event server closes clients gracefully (code 1001), so `run.finished` reaches them.
- **Consequences:** F11 and F12 call core's `summon()`. F14 adds the `--only` diff on top of `verdicts.json`. F26 replaces the CLI's draft wordmark and initials.

