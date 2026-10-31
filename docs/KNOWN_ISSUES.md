# Poltergeist: Known Issues

> Open risks, unknowns and problems, worked through one at a time. Take the highest-severity issue that blocks the next TBD feature in [PRD.md](PRD.md).
> **Severity:** `Blocker` (stops the core loop or the submission) · `Major` (hurts the demo or the score) · `Minor`
> **Status:** `Open` · `Investigating` · `Resolved` (add the date and what fixed it) · `Accepted` (we live with it)
> Add new issues at the bottom with the next ID. Don't delete resolved ones.
>
> **KI-01 to KI-23 come from the prototype** (`../poltergeist-old`). File and function names in their notes describe the prototype's code, which this repo does *not* contain (D-25). They're kept because the rebuild faces the same problems: treat each prototype note as "how it was solved last time", and re-check it while rebuilding. KI-24 onward are new. References to `SPEC.md`, `SPEC §6.x` or `R<n>.<m>` in those entries now mean `.kiro/specs/poltergeist/design.md` and requirement `<n>.<m>` in `requirements.md` (D-25).

| ID | Issue | Severity | Blocks | Status |
|---|---|---|---|---|
| KI-01 | The LLM may not reliably turn EARS criteria into valid, meaningful plans | Blocker | F05 | Open |
| KI-02 | The oracle problem: an assertion may not truly capture the criterion | Major | F05, F07 | Open |
| KI-03 | Choosing which route a criterion belongs to | Major | F03, F05 | Investigating (deterministic picker, D-32; measure in the spike) |
| KI-04 | Candy Swap might not contain any interesting real bugs | Major | F10, demo | Open |
| KI-05 | 2026 rules, tracks, deadline and "new projects only" are unconfirmed | Blocker | submission, D-02 | Open |
| KI-06 | Kiro hook schema, MCP config location and Power format are not verified | Major | F11, F13, F18 | Open |
| KI-07 | Race windows may be too narrow to hit reliably | Major | F06 (Doppelgänger) | Open |
| KI-08 | Frame streaming from 12 ghosts may be too heavy | Minor | F12 | Open |
| KI-09 | Judges may not be able to run a live haunting themselves | Major | F15, F21 | Open |
| KI-10 | Test-account and login handling for every persona | Major | F03, F06 | Open (Scout half solved in prototype, D-20) |
| KI-11 | Possible LLM refusals or watered-down plans | Minor | F05 | Open |
| KI-12 | MCP calls that run for a long time (minutes) may time out in the client | Major | F11 | Open |
| KI-13 | Resetting state between repetitions with concurrent ghosts | Major | F06 | Open |
| KI-14 | LLM cost and rate limits during development | Minor | F05 | Open |
| KI-15 | Code written in this playtest repo may not count for the main submission | Major | everything | Resolved (2026-10-31, D-25) |
| KI-16 | Current Kiro-generated `requirements.md` layout is only verified against one hand-edited sample | Minor | F01 | Open |
| KI-17 | Forbidden rules only check the first request of a redirect chain; matching uses the raw (percent-encoded, case-sensitive) pathname | Minor | F02, F17 | Open (path decoding fixed in F02; redirect hops open for F17) |
| KI-18 | Guard reporting gaps that stay on the machine or are still blocked | Minor | F06 | Open |
| KI-19 | A `resetCommand` that backgrounds a long-lived child keeps the pipes open, so reset times out and kills it | Minor | F06 | Resolved (2026-10-31, D-29) |
| KI-20 | An unused account with an unset `env:NAME` password keeps the literal `env:NAME` string as its password | Minor | F03, F06 | Resolved (2026-10-31, D-29) |
| KI-21 | F02 deferred review minors: hardening and test gaps in config, reset and guard | Minor | F02, F06 | Resolved (2026-10-31, D-29); deferred minors in KI-29 |
| KI-22 | F03 deferred review minors: login heuristic, redaction and capture hardening, test gaps | Minor | F05, F06 | Resolved (2026-10-31, D-30) |
| KI-23 | Under load, Chromium sometimes reports a stopped redirect hop only as a failure of the original request, so the guard missed it (CI red) | Major | F02, CI (D-19) | Resolved in prototype (D-22); build it in from the start |
| KI-24 | Eligibility: the idea was prototyped before the window; how to present the rebuild honestly | Major | submission | Open |
| KI-25 | Glyph rendering of 12 live tiles at 4 fps may be too slow in the browser | Minor | F26, F12 | Open |
| KI-26 | Fine ASCII glyphs may turn to mush after YouTube compression | Major | F26, video | Open |
| KI-27 | Poltergeist could look too similar to Reanimator (same team circle, same dither technique) | Minor | F26, D-24 | Open |
| KI-28 | `npm audit` reports 11 moderate issues in dev-only lint tooling (minimatch, via eslint and typescript-eslint) | Minor | none (dev only) | Open |
| KI-29 | F02 rebuild review minors: WebRTC iframe layer, dead-port reuse, provider keys in reset env, unbounded reset buffer, non-canonical IPv6 entries, terse missing-file message, guard tests that could reach the internet on regression | Minor | F06 | Open |
| KI-30 | F03 Done-when has not yet been run against the real Candy Swap (built against a fixture, D-30) | Major | F03 sign-off, KI-01 spike | Open |
| KI-31 | F03 rebuild review minors: label lookups before trim, capture calls without timeouts, sub-path session loss, reserved `anonymous` account name, standing alerts on login pages, login-time blocks not in any file, shadow-DOM testIds, case-only slug collisions | Minor | F05, F06 | Open |
| KI-32 | Valid form fills may need typed inputs (numbers, emails, dates); DSL `literal` input vs D-04 unresolved | Minor | KI-01 spike, F04 follow-up | Open (`literal` dropped, D-32; typed generators open) |
| KI-33 | F04 review minors: BLNS header rule fragile on upstream bumps, no `.gitattributes` for vendored data, `blns.txt` read from source path (packaging), RangeError checked before unknown id, try/catch `.id` assertions | Minor | F09 (packaging) | Open |
| KI-34 | F05 Done-when (≥ 80% valid or justified `notApplicable`, live LLM) not yet run against the real Candy Swap; KI-01 spike re-scoped to use F05 | Major | F05 sign-off, KI-01 spike | Open |
| KI-35 | F05 review minors: cache/plan write failure loses paid results, duplicate persona ids, prompt changes not in the cache key (title, snapshot, manual `PROMPT_VERSION`), same path under two identities, unstated prompt limits, backslash `api` paths, theme words via user/app content | Minor | F06, F09 | Open |

---

### KI-01: The LLM may not reliably compile EARS criteria into valid, meaningful plans · Blocker · Open
- **Why it matters:** this is the core assumption. If plans are invalid or trivial, nothing downstream matters.
- **Next action (week 1 spike):**
  1. Take 5 real criteria from the Candy Swap spec.
  2. Compile 3 personas for each.
  3. Run each plan 10 times.
  4. Measure: % valid on the first try, % valid after the retry, % flaky, and human-judged "is this a meaningful test?"
- **Pass bar:** ≥ 80% valid or justified `notApplicable`, ≤ 20% flaky.
- **If it fails:**
  - Shrink the DSL further into per-persona templates. The LLM would only fill slots (route, target, generator, assertion type).
  - Add few-shot examples to the prompt.

### KI-02: The oracle problem · Major · Open
- **Problem:** "THE SYSTEM SHALL prevent duplicate claims" needs an assertion the UI may not reveal (e.g. the DB state).
- **Options:**
  - (a) `api` assertions against the app's own read endpoints. This is already in the DSL.
  - (b) An optional app-provided `/__poltergeist/state` probe. This is not planned, and adding it would need a new feature.
  - (c) Accept `notApplicable`.
- **Next action:** in the KI-01 spike, count how many criteria need state that isn't visible through the UI or API.

### KI-03: Choosing which route a criterion belongs to · Major · Open
- **Problem:** criteria rarely name URLs. Sending all scout snapshots blows up the prompt.
- **Idea:**
  1. A cheap first pass: the LLM, or a keyword match against route titles and element names, picks ≤ 2 routes per criterion.
  2. The compiler then gets only those snapshots.
- **Decide during:** F05.
- **2026-10-31 (F05 grill, D-32):** deterministic keyword-overlap picker, top 2 `ok` routes, no LLM pass; no match → `uncompilable`. Measure miss rate in the KI-01 spike; fall back to a cheap LLM pass only if it misses.
- **2026-10-30 (F03 done):** Scout now provides per-route hashes, titles and interactive lists to choose routes from. The decision itself is still F05's.
- **2026-10-31 (F03 rebuild):** the same holds; route files also carry a `testIds` list for non-interactive targets (status messages), which may help match criteria to routes.

### KI-04: Candy Swap might not contain any interesting real bugs · Major · Open
- **Context:** D-10 forbids planting bugs.
- **Mitigations:**
  - Build it in a normal, quick hackathon style (naive check-then-write claims, client-only validation in places a typical first pass would have them). That is realistic, but these must not be deliberately inserted.
  - Point Poltergeist at a second honest app (e.g. one of the team's older hackathon projects) as a backup.
  - If the hero run is clean, the video tells a "clean bill of health + one flaky" story.
- **Next action:** after F10, run an early haunting and log what's found.

### KI-05: The 2026 rules are unconfirmed · Blocker · Open
- **Unconfirmed:**
  - The categories and the new tracks.
  - The judging weights.
  - The team-size limit.
  - The video length cap.
  - The deadline (reported as 2026-12-04 2pm PT).
  - Whether "only new projects count".
- **Next action:** read kiroween.devpost.com/rules (it was due on 2026-10-30). Update D-02, the PRD timeline and the video plan.

### KI-06: Kiro hook schema, MCP config location and Power format are not verified · Major · Open
- **Rule:** don't guess. Check the current docs (kiro.dev/docs) and the Kiro IDE/CLI. Reanimator found that some docs still describe older versions.
- **Next action:**
  1. Before starting F11, F13 or F18, write the confirmed facts to `docs/kiro-notes.md` (hook triggers, hook file format, MCP settings path, Power manifest).
  2. Update SPEC §6.8.

### KI-07: Race windows may be too narrow to hit · Major · Open
- **Mitigation already in the design:** `barrier` + `holdRequests`/`releaseRequests` (SPEC R6.3–R6.4).
- **Remaining risk:** server-side races that happen after the request arrives, e.g. SQLite serialising writes.
- **Next action:** prove that a naive check-then-insert endpoint loses the race under a Doppelgänger plan in ≥ 2 of 3 reps.

### KI-08: Frame streaming from 12 ghosts may be too heavy · Minor · Open
- **Plan:**
  - CDP screencast at quality ~50.
  - Downscaled to tile size.
  - ≤ 4 fps per ghost.
  - Drop frames when the socket backs up.
- **Next action:** measure during F12, and fall back to screenshots on each step if needed.

### KI-09: Judges may not be able to run a live haunting · Major · Open
- **Context:** the rules require a working app URL. Live runs need Chromium plus a running target.
- **Plan:**
  - F15 static replay as the URL (clearly labelled as a recording).
  - A one-command local setup in the README.
  - F21 hosted sandbox only if time allows.
- **Next action:** confirm what "working app" means in the 2026 rules (KI-05).

### KI-10: Test-account and login handling · Major · Open
- **Problem:**
  - Every context needs to log in.
  - The Doppelgänger needs the *same* account in two contexts.
  - The Revenant needs a session to expire.
- **Plan:**
  1. Log in once per account during Scout.
  2. Save Playwright `storageState`.
  3. Reuse it for the contexts.
  4. Have a `login` step for explicit flows.
- **2026-10-30 (F03 grill, D-20):** Scout logs in heuristically (with optional `fields` overrides) and returns each account's `storageState` in memory, never on disk. Still open: how F06 runs a Doppelgänger with two contexts on one account, and how the Revenant expires a session.
- **2026-10-30 (F03 done):** Scout's half is done (login plus in-memory storageState). F06's Doppelgänger and Revenant handling is still open.
- **2026-10-31 (F03 rebuild):** rebuilt the same way; `scout()` returns `sessions: Map<account, storageState>`.

### KI-11: Possible LLM refusals or watered-down plans · Minor · Open
- **Assessment:** this is low-risk because of D-08 and D-09 (plain QA wording, own app, no payload generation, localhost allowlist).
- **Next action:** count refusals and empty plans in the KI-01 spike. Expect about zero.

### KI-12: Long-running MCP calls may time out · Major · Open
- **Problem:** a full haunting takes minutes. MCP clients (including Kiro) may time out on a tool call.
- **Options:**
  - (a) `summon_ghosts` starts the run and returns a `runId` immediately, plus a `get_run_status` tool.
  - (b) Progress notifications.
  - (c) The default call runs a small subset, e.g. haunted-only or `--reps 1`.
- **Next action:** check Kiro's MCP timeout (KI-06), then choose. (a) is the safe default.

### KI-13: Resetting state between repetitions · Major · Open
- **Problem:** `resetCommand` between repetitions is easy when repetitions run one after another. But plans run concurrently *within* a repetition and can interfere with each other (e.g. two different plans claiming the same candy).
- **Options:**
  - Partition the seed data per plan (each plan gets its own candy and user namespace).
  - Or run plans that touch the same route one after another.
- **Next action:** decide in F06 design. Partitioning is preferred, since Candy Swap can seed N namespaces.
- **Notes (2026-10-30, F02 done):** `runReset` exists in `@poltergeist/core`. It runs `resetCommand` through the shell in the config file's directory, with a timeout and a process-group kill. *When* it runs and the seed partitioning remain F06 decisions. Still Open.

### KI-14: LLM cost and rate limits during development · Minor · Open
- **Mitigation:**
  - Plan cache.
  - `--recompile` only when needed.
  - A console spend limit.
  - Use the smaller model for the KI-03 route-picking pass.
- **Next action:** add a small spend log like Reanimator's `spend` script.

### KI-15: Playtest code may not count for the main submission · Major · Resolved
- **Context:** this repo is a playtest. 2026 reportedly accepts only new projects, and the main project has to show Kiro usage from day one.
- **Plan:**
  - Treat this repo as a prototype for learning.
  - Rebuild in the main repo with specs in `.kiro/specs/` and history that starts inside the hacking window.
  - Copy *decisions and docs*, and re-implement the code there.
- **Next action:** confirm the eligibility wording in the 2026 rules (KI-05).
- **Resolved (2026-10-31, D-25):** fresh repo with history inside the window. Docs were rewritten and code is rebuilt, not ported. Presenting this honestly is now KI-24.

### KI-16: Current Kiro-generated `requirements.md` layout is only verified against one sample · Minor · Open
- **Problem:** F01's parsing rules (D-16) are based on the Reanimator spec, which a person edited, and on kiro.dev's one-line EARS template. From memory, without checking it this session: newer Kiro output uses `**User Story:**`, `#### Acceptance Criteria`, a `## Glossary` and `THE <Component_Name> SHALL`. Its tasks cite `_Requirements: 1.1, 2.3_`. It is unknown whether Kiro ever writes criteria as bullets or with explicit IDs.
- **Blocks:** F01's robustness on real user specs.
- **Next action:** generate a fresh spec with Kiro (main project, or Candy Swap in F10) and add it as an F01 fixture. If it uses bullets or explicit IDs, add a decision that extends D-16.
- **Notes (2026-10-30, F01 done):** the parser reports layouts it can't read as warnings instead of dropping them silently: `no-criteria` (e.g. bulleted criteria), `ignored-list` (a second numbered list), `unrecognized-heading` (`Requirement #3`) and `empty-spec`. Deferred minors from the review: suffixes after 26 duplicate requirement numbers; `Requirement 1a` parsing as 1; code blocks and tables inside a criterion not hashed; `IF-Match` read as IF; a lowercase `the` subject not split when there's no comma; specs inside a blockquote.
- **Notes (2026-10-31, F01 rebuild review): deferred minors.**
  - An ordered list under a non-AC sub-heading (e.g. `#### Notes`) *before* `#### Acceptance Criteria` is taken as the criteria, and the real list gets `ignored-list`.
  - `Requirement 03` isn't normalized to `3`, and isn't flagged as a duplicate of `3`.
  - In fallback mode (no `Requirement N` headings), a requirement can be titled "Acceptance Criteria".
  - Inline HTML (`<br>`) is kept verbatim in the criterion text.
  - Test nits: `read.test.ts` leaves a temp folder behind; the perf test is wall-clock.
- **Notes (2026-10-31, F01 rebuild grill):** all the deferred minors above are ruled on in D-27. The issue stays open until a real Kiro-generated spec (Candy Swap, F10) is added as a fixture.


### KI-17: Forbidden rules only check the first request of a redirect chain · Minor · Open
- **Problem:** a 307/308 to a forbidden path on an allowed host isn't blocked, because only the first request of a chain is matched. Matching also uses the raw (percent-encoded, case-sensitive) pathname, so `/api/%61dmin` slips past a rule for `/api/admin*`.
- **Blocks:** F02's completeness and F17 (steering rules).
- **Next action:** decode the path once before matching, and consider the proxy/`requestfailed` path for redirect hops. Revisit when F17 lands.
- **2026-10-31 (F02 rebuild, D-29):** the pathname is now percent-decoded once before matching (bad encodings fall back to the raw path), so `/api/%61dmin` matches `/api/admin*`. The final review confirmed a 307 from an allowlisted path to a forbidden one still goes through unreported. That half stays open for F17.

### KI-18: Guard reporting gaps that stay on the machine or are still blocked · Minor · Open
- **Problem:**
  - WebSockets from dedicated Workers bypass `routeWebSocket`. The dead proxy blocks them, but they aren't reported.
  - ~~Chromium implicitly bypasses the proxy for the whole loopback range on redirect hops (e.g. `127.0.0.2` is reachable and unreported).~~ **Resolved 2026-10-30:** this was not machine-local: the implicit bypass also covers link-local (`169.254.0.0/16`, `fe80::/10`), so a redirect could reach cloud metadata at `169.254.169.254` directly. Fixed by putting `<-loopback>` first in the bypass list (D-18); `127.0.0.2` and `169.254.169.254` hops now fail with `ERR_PROXY_CONNECTION_FAILED`. Failures the guard can't confirm are reported as `leak`.
  - Redirect-hop reports arrive asynchronously via `requestfailed`.
  - `about:blank` popups hang on fetch once a route is installed (nothing leaves the machine).
  - The per-context proxy is only verified on Linux Chromium.
- **Blocks:** F06 (runner robustness and block reporting).
- **Next action:** F06 adds a step timeout and reports worker websockets via page/worker events if needed. Do the cross-platform check before the demo.
- **2026-10-31 (F02 rebuild review):** a same-origin `about:blank` iframe's `contentWindow.RTCPeerConnection` escapes the init script. The launch flag and the dead proxy are still the backstop, so this is a lost layer, not a known leak. WebTransport (HTTP/3 over UDP) and DNS prefetch/preconnect behind the dead proxy are unverified. Check all three in F06.

### KI-19: A `resetCommand` that backgrounds a long-lived child keeps the pipes open · Minor · Resolved
- **Problem:** a reset command such as `npm run dev &` leaves a child holding stdout/stderr. `runReset` waits for `close`, so it reports `timeout`, and the process-group SIGKILL then kills the user's server.
- **Blocks:** F06 (reset between repetitions).
- **Next action:** decide in F06 whether to resolve on `exit` and detach the pipes, or document that `resetCommand` must not start servers.
- **Resolved (2026-10-31, F02 rebuild, D-29):** `runReset` resolves on `exit`, waits up to 100 ms for the pipes to close, then destroys them. It kills the process group only on timeout. Tested with `cmd & echo ok`. `resetCommand` must not start servers (design §3).

### KI-20: An unused account with an unset `env:NAME` password keeps the literal `env:NAME` string · Minor · Resolved
- **Problem:** `loadConfig` only fails on a missing env var for accounts that a route uses. An unused account keeps `env:NAME` as its password in `LoadedConfig`, so a later login step (F03/F06, e.g. Revenant `login {account}`) could silently log in with that string.
- **Blocks:** F03, F06 (login steps that reference accounts).
- **Next action:** when login steps reference accounts, validate and resolve the referenced accounts the same way routes do.
- **2026-10-30 (F03):** Scout only logs in to accounts that routes use, and `loadConfig` already resolves those. Scout also refuses any password still shaped like `env:NAME` with an unset variable. Still open for F06's `login {account}` step.
- **2026-10-30 (F03 done):** Scout's pre-check is done (`ConfigError` for an unset env password on a route-used account). F06's `login {account}` is still open.
- **Resolved (2026-10-31, F02 rebuild, D-29):** `loadConfig` drops an unused account whose `env:NAME` is unset or empty and adds an `unresolved-secret` warning. `LoadedConfig.accounts` only holds usable accounts, so F06's `login {account}` can't log in with a literal `env:NAME`.

### KI-21: F02 deferred review minors · Minor · Resolved
- **Context:** F02's task reviews and final review (2026-10-30) left these minor items. None lets traffic leave the machine, and the serious ones are already KI-17 to KI-20.
- **Hardening:**
  - Reset output is cut to the last 64 KB *before* redaction, so part of a secret can survive at the cut (`config/reset.ts`). Redact first, then trim.
  - `runReset` uses `process.env`, not the `env` passed to `loadConfig`. A caller that resolves secrets from a custom env gets a reset without them.
  - `guardContextOptions` doesn't validate its entries. Config entries are validated by the schema, but a direct caller passing `,`, `<` or `*` could widen the proxy bypass. Validate there too, or make it internal.
  - The schema's IPv6 pattern for `allowedHosts` still accepts malformed forms such as `:::` and `1:2:3`. They never match a real host, so this fails closed.
  - Validation issue *paths* are not redacted, only messages. This only matters if a secret is used as an account name.
  - `matchForbidden` recompiles each rule's regex on every request. Precompile once per rule list if request volume matters.
- **Guard API (F06):**
  - `BlockedRequest` doesn't carry the browser's `errorText`, which F06 will want for diagnosing `leak` reports.
  - A page navigating away mid-redirect (`net::ERR_ABORTED`) is reported as `leak`. This is conservative (a false alarm, never a false all-clear), but F06 should expect it.
- **Test gaps:**
  - No test redirects through `localhost` or `[::1]`. A reviewer probe showed both work, but a change to the bypass ordering could break them silently.
  - Some negative assertions (`blocked` is empty) run right away, while blocked-request reports now arrive asynchronously.
  - Untested: IPv4 and `::1` entries in `allowedHosts`; bounds on `reps` and `resetTimeoutMs`; empty `resetCommand`; strictness inside nested objects; a route naming a missing account; a short or common-word literal password; `loadConfig` with an empty env var; userinfo-spoofed (`http://localhost@evil.com`) and trailing-dot targets; the reset 64 KB trim, 20-line tail and `spawn` failure; first-match-wins and lowercase methods in `forbidden`; a limiter task that throws synchronously; a guard test with a non-empty `allowedHosts`.
  - The secret-in-reset-output test uses a literal `echo pw=hunter22`, not `$POLTERGEIST_PW` through the environment.
- **Next action:** pick up the hardening items when F06 starts consuming the guard and `runReset`. Add the tests opportunistically when touching each module.
- **Resolved (2026-10-31, F02 rebuild, D-29):** every hardening item and test gap above was built in the first pass. The bypass builder is internal and re-validates entries, IPv6 uses `net.isIPv6`, and `BlockedRequest.errorText` is set on failure-classified blocks. The final review's minors are in KI-29.

### KI-22: F03 deferred review minors · Minor · Resolved
- **Context:** F03's task reviews and final review (2026-10-30) left these minor items. The serious ones were fixed before merge (see D-21).
- **Login:**
  - The success heuristic (left `loginRoute` or no password field) can false-positive (for example `/login/failed`). A failed login also waits out the full `loginTimeoutMs`. Routes that bounce back to the login page are still marked `authFailed`.
  - The `waitForURL` catch swallows every error, not only timeouts.
  - `fields` overrides skip `count()`, so a stale override burns the budget and gives a generic reason.
- **Redaction and URLs:**
  - Percent-encoded secrets in URLs evade the substring redaction.
  - The blocked request's `host` is not redacted (only `url` is).
  - A target with userinfo (`http://u:p@host`) is still accepted.
- **Capture:**
  - A capture error that isn't a timeout is not trimmed to its first line in the reason.
  - The aria-name unescape covers only `\"` and `\\`.
  - Duplicate testIds attach to the first match only, and testId-only entries are appended after the cap ordering.
  - `captureRoute` does one `ariaSnapshot` per testId (up to 200), serially, with no per-id try/catch, so one detached element aborts the capture.
  - The 250 ms testId timeout can drop testIds on slow pages (they degrade to role and name).
  - The trim cut can end in the middle of an escape (`\"`), and both collapse rules can apply to one line. `KEY_OVERHEAD=28` is hard-coded in `trim.ts`.
  - `routeHash` includes `count`, which the brief didn't document (kept on purpose).
- **Test gaps:**
  - No test for quoted names over 80 characters; the slug char-class test doesn't assert exact output; the schema reject tests were green before the implementation.
  - Login: the deadline path, the SPA success branch with no password field, a reason that never contains the password, fixture `close()` with a `/slow` request open, and `locateTarget` ignoring the login result.
  - The `page could not be reopened` branch is untested. The `/huge` end-to-end assertion is loosened (the budget is proven by unit and `/cards` tests). The `vi.mock` factory reads a module-level `pagesSeen` (fragile).
- **Next action:** pick up the login and redaction items when F06 starts using Scout's output, and the rest opportunistically.
- **2026-10-31 (F02 rebuild):** targets with userinfo (`http://u:p@host`) are now rejected by the config schema (D-29). The redactor also scrubs percent-encoded secrets. The rest waits for F03's rebuild.
- **2026-10-31 (F03 rebuild, resolved, D-30):** all items built in the first pass.
  - Login: success needs no visible password field and a page off the `loginRoute` subtree (or exactly on it, for SPAs), so `/login/failed` fails; failures are detected after a page load or an alert plus 500 ms, not at the deadline; only `TimeoutError` counts as a timeout; `fields` overrides are `count()`-checked with a specific reason; reasons are redacted.
  - Redaction: blocked `url`, `host` and `errorText`, `finalPath`, `reason`, title and snapshot are redacted; elements and testIds that would change under redaction are dropped; percent-encoded secrets were handled in F02.
  - Capture: non-timeout errors are cut to one line; names are unescaped with `JSON.parse`; duplicate testIds are dropped; testIds are looked up concurrently with a per-id try/catch, and a lookup timeout degrades to a bare `{testId}` instead of dropping it; unattached testIds live in their own list, inside the budget.
  - Trim: collapsing works on decoded values and re-encodes, so it never cuts mid-escape; both collapse rules on one line are tested; the key overhead is measured, not hard-coded.
  - Tests: quoted names over 80 characters, exact slug outputs, the SPA success branch, the login deadline, reasons without the password, and the 1-CPU run are all covered.

### KI-23: Under load, Chromium sometimes reports a stopped redirect hop only as a failure of the original request · Major · Resolved
- **What happened:** the first two CI runs after the F03 merge (41101768063 and 41171915551, 2026-10-30/31) failed in `guard.test.ts` › "EventSource redirect to a third-party host is blocked": `blocked` stayed empty. The page saw `'error'`, so the request was stopped.
- **Wrong first diagnosis (2026-10-31):** I took it for a late report and raised `expect.poll`'s timeout to 5 s in `vitest.config.ts`. CI failed again with the longer timeout. The timeout change stays (harmless), but it was not the fix.
- **Real cause:** reproduced locally by pinning the guard and scout tests to one CPU (4 of 5 runs failed). An event log showed Chromium emitting `requestfailed` for the original allowlisted request (`127.0.0.1/redirect`, `net::ERR_PROXY_CONNECTION_FAILED`) and never emitting the hop to `example.com`. The guard skipped failures on allowlisted hosts, so `onBlocked` was never called. The subresource-redirect test failed the same way. The block worked; the report was lost. F03's extra parallel browser tests made the load common enough to show it.
- **Resolved (2026-10-31, D-22):** an allowlisted request that fails with `net::ERR_PROXY_CONNECTION_FAILED` is reported with the new reason `redirect` (its `url` is the original request; the hop's target is unknown). Only a redirect hop can reach the dead proxy, since allowlisted hosts bypass it. Two browser-free tests drive the `requestfailed` listener directly. The redirect browser tests accept exactly one report in either form. The one-CPU stress run then passed 6 of 6.
- **Still open:** the `leak` test (guard without the dead proxy) could see the same Chromium variant, where a direct-hop failure lands on the original request and isn't reported. That only matters if the guard is installed without `newGuardedContext`, which D-18 forbids.

### KI-24: Eligibility of a prototyped idea · Major · Open
- **Context:** F01–F03 were built in a private repo before the window opened (`../poltergeist-old`, first commit 2026-10-30). This repo starts fresh (D-25).
- **Risk:** a judge or the rules may see prior work as disqualifying, or may see a fresh repo with very detailed docs on day one and wonder where they came from.
- **Plan:**
  - Keep `../poltergeist-old` private and don't publish or link it.
  - Don't port code, so every line in this repo is written inside the window, and the git history shows it.
  - In the Devpost write-up, say plainly: "We explored the idea in a throwaway prototype before the event, then rebuilt Poltergeist from scratch during the hacking period. The design docs carried over; the code did not."
  - Most hackathons allow planning before the event but not submitting pre-built code. Confirm this in the 2026 rules (KI-05).
- **Next action:** read the 2026 rules' eligibility and "new project" wording, and update this entry.

### KI-25: Glyph rendering performance · Minor · Open
- **Problem:** 12 tiles × 4 fps × about 96×40 glyphs is about 180k glyphs per second, on top of JPEG decoding.
- **Plan:**
  - Pre-render a glyph atlas per colour step and blit with `drawImage`.
  - Compute luminance on a downscaled `OffscreenCanvas`, ideally in a Worker.
  - Drop frames rather than queue them.
- **Next action:** benchmark in F26's demo page with 12 synthetic tiles.

### KI-26: ASCII may turn to mush after video compression · Major · Open
- **Problem:** YouTube compresses fine, high-contrast detail hard, and dense glyphs on black are a worst case. The video is the main thing judges see.
- **Plan:**
  - Use glyph cells of at least 8×16 px on screen at 1080p, and consider uploading at 1440p or 4K (YouTube gives higher-res uploads a better codec and bitrate).
  - Avoid single-pixel strokes in sprites.
  - Test early: record 20 s of the F26 demo page, upload it unlisted and look at it on a phone.
- **Next action:** part of F26's Done-when.

### KI-27: Looking too similar to Reanimator · Minor · Open
- **Problem:** Reanimator (a friend's Kiroween entry) uses the same Bayer dither technique for its dot-matrix art. Judges could see two entries with a shared look.
- **Mitigation:** D-24's differences: characters instead of dots, green ghosts instead of purple magic, a terminal instead of a cinematic necromancer, and a different typeface. No shared assets.
- **Next action:** once F26's demo page exists, put screenshots side by side with Reanimator's prototypes and check they read as different.


### KI-28: Moderate `npm audit` findings in dev-only lint tooling · Minor · Open
- **Problem:** `npm audit` (2026-10-31, scaffold) reports 11 moderate issues, all from `minimatch` pulled in by `eslint` 9.39.1 and `typescript-eslint` 8.72.1. None of them ship in `@poltergeist/core`'s runtime dependencies.
- **Blocks:** nothing. It's lint tooling only, and isn't run on untrusted input.
- **Next action:** before submission, check whether newer eslint or typescript-eslint patch releases fix it. Bump the pins in STACK.md if so. Don't use `npm audit fix --force`.

### KI-29: F02 rebuild review minors · Minor · Open
- **Context:** the final review of the F02 rebuild (2026-10-31). Its four Important findings were fixed before merge (JSON errors never echo source text, the config snapshot redacts literal passwords, reset output is decoded per stream and redacted per stream). These minors remain. None lets traffic leave the machine.
- **Guard:**
  - The WebRTC init script is bypassed by a same-origin `about:blank` iframe (also noted on KI-18). The launch flag and the dead proxy still block it.
  - The dead proxy port is reserved, then closed. Another process could later listen on it. Traffic would only leave if that process acted as a proxy. Fix: keep a listener that destroys every connection, owned by the context. Check that Chromium still reports `ERR_PROXY_CONNECTION_FAILED` (D-22 depends on it).
  - Non-canonical IPv6 entries (`0:0:0:0:0:0:0:1`, `::ffff:127.0.0.1`) pass validation but never match, because the URL parser canonicalises hosts. This fails closed. Canonicalise in `effectiveHosts`.
- **Reset:**
  - `runReset` passes the whole env, but the Redactor only knows account passwords. A `set -x` or env dump would put `ANTHROPIC_API_KEY` or `DOPPLER_TOKEN` into `outputTail`. Add known provider keys to the Redactor, or strip them from the reset env.
  - Output is buffered without a limit before redact-then-trim. Use a ring buffer of 64 KB plus the longest secret.
- **Loader:** the missing-file message (`cannot read <path>: ENOENT`) could suggest `--config` or creating `poltergeist.config.json`.
- **Tests:** the guard tests use `example.com`, which `--host-resolver-rules=MAP *.test` doesn't cover. If the guard regressed, they would reach the real internet. Use `evil.test` instead.
- **Next action:** pick these up when F06 starts consuming the guard and `runReset`.

### KI-30: F03 Done-when not yet run against the real Candy Swap · Major · Open
- **Context:** F03 was built before F10 (D-30), so its Done-when ran against a tests-only fixture shaped like Candy Swap.
- **Risk:** the real Kiro-built app may use markup the login heuristic or the capture rules don't expect (unlabelled inputs, icon buttons, client-side login).
- **Next action:** when F10 lands, run `scout()` against `http://localhost:4000` with Candy Swap's config. Check that the "Claim" buttons and the trade-form fields are listed by role and name, and that every emitted label and testId resolves. Add an integration test if it can run in CI.

### KI-31: F03 rebuild review minors · Minor · Open
- **Context:** the final review of the F03 rebuild (2026-10-31). Its Critical and Important findings were fixed before merge: a secret in a testId element's name, JSON-escaped secrets in snapshots, login forms rendered after load, a spinner taken for in-place login success, and a path under two identities overwriting its file (D-30).
- **Capture:**
  - `attachLabels` runs a `getByLabel` count for every labelable entry before trim. A page with ~1500 labelled inputs at a 3 s budget ends as `capture failed`. Trim first (≤ 200 entries), and degrade (skip labels and testIds) instead of throwing when the budget is spent.
  - `count()`, `evaluateAll()`, `page.title()` and `page.close()` have no timeout, so a hung renderer could stall a route past its hard budget. Race `captureRoute` against the deadline.
  - testId uniqueness is counted with `evaluateAll` on the light DOM, while `getByTestId` pierces shadow DOM, so a "unique" id could resolve to two elements.
- **Login and identities:**
  - Session loss is exact `finalPath === loginRoute` (D-21). A bounce to `/login/expired` is reported as `redirected`. `isUnderLoginRoute` could be used.
  - An account named `anonymous` is treated as the anonymous identity. Reserve the name in the config schema.
  - A `role=alert` that is always visible on the login page makes a slow (> 500 ms) successful submit look failed. Ignore alerts present before the click.
  - A wrong `fields.password` override waits out the login budget before the specific reason is given.
  - Requests blocked during login reach `onBlocked` but no route file; late blocks from one page can be attributed to the next route.
- **Files:** slugs differing only by case collide on case-insensitive filesystems; a very long path can make `writeFile` throw `ENAMETOOLONG` and abort the run.
- **Next action:** pick these up when F05/F06 start consuming Scout output, or when KI-30's real Candy Swap run hits one.
### KI-32: Typed inputs and DSL `literal` · Minor · Open
- **Context:** F04 (D-31) added a `plain` generator for ordinary valid values. Forms that need a number, email or date can't be filled validly by any generator yet. The DSL in design §6 also allows `input:{literal}`, which lets the LLM write a value and sits awkwardly with D-04.
- **Blocks:** F05 (schema) and the KI-01 spike (it may show plans needing typed values).
- **Next action:** in the spike, count how often a plan needed a typed value or used a literal. Then decide in F05 whether to add typed generators (`number`, `email`, `date`) or keep a restricted `literal`, and record a D-xx.
- **2026-10-31 (F05, D-32):** `literal` is dropped from the DSL. Typed generators remain open: add them to F04's registry if the spike shows plans needing them.

### KI-33: F04 review minors · Minor · Open
- **Context:** the final review of F04 (2026-10-31). Its one Important finding was fixed before merge (the jinja2 SSTI section is now excluded, D-31). These minors remain.
- **Naughty strings:**
  - The header rule ("a `#` line after an empty line") also turns BLNS comment paragraphs into pseudo-sections. That's harmless today. But if a future BLNS bump puts a comment paragraph inside an excluded section, the rest of that section would leak in under a title we don't exclude. Fix: pin the count (241) or a hash of `naughtyValues()` in a test before any bump.
  - There's no `.gitattributes`, so `core.autocrlf` or a whitespace-trimming editor could alter the vendored `blns.txt`. Fix: mark it `-text`.
- **Packaging:** `naughty.ts` reads `data/blns.txt` via `import.meta.url`. That works from source (tsx, vitest), but breaks if F09's `npx poltergeist` is bundled or built to `dist/` without copying `data/`. Fix in F09: copy the asset, or generate a JSON module at build time.
- **API:** `generate('bogus', -1, 0)` throws `RangeError` before `UnknownGeneratorError`. Swap the order if F05's error mapping cares.
- **Tests:** the try/catch `.id` assertions in `generators.test.ts` and `registry.test.ts` would pass silently if nothing threw (the `toThrow` line above them covers it). Use `toThrow(expect.objectContaining({ id }))`.
- **Next action:** fix the `.gitattributes` and count pin with the next naughty-strings change. Fix the packaging item in F09.

### KI-34: F05 Done-when not yet run live against Candy Swap · Major · Open
- **Context:** F05 was built fixture-first (D-32): F10 isn't built, the KI-01 spike hasn't run, and no API key is available in dev sessions. Health tests use a fake `LlmClient`.
- **Blocks:** F05 sign-off, the KI-01 spike.
- **Done on the fixture (2026-10-31):** `packages/core/test/compiler/done-when.test.ts` compiles a 5-criterion fixture spec against the fixture's real Scout output with a scripted fake: 15/15 valid or justified `notApplicable`, and a rerun makes 0 calls.
- **Next action:** once F10 exists and a key is available (`doppler run -- …`), compile Candy Swap with `createAnthropicClient()`: record % valid on first try and after retry, justified `notApplicable`, refusals and route-picker misses; rerun to confirm zero LLM calls. Feed the numbers into the re-scoped KI-01 spike.

### KI-35: F05 review minors · Minor · Open
- **Context:** the final review of F05 (2026-10-31). Its four Important findings were fixed before merge: cached plans re-stamped with the current criterion id, queued pairs stop after a `CompilerError`, missing credentials abort with `CompilerError`, and barriers must be met in the same order by every actor (D-32).
- **Writes:** `writeCache` and the `plans/` writes throw, so a full or read-only disk (or a bad `cacheDir`) rejects `compile()` after the LLM calls were paid for. Make cache writes best-effort and clean up the `.tmp` file on a failed rename.
- **Inputs:** duplicate ids in `opts.personas` give duplicate pairs and two concurrent writes to one plan file. Dedupe or reject.
- **Cache key gaps:** the route title and snapshot reach the prompt but not `routeHash` (Req 3.7 by design), so a plan built on old static text can be reused. `SYSTEM_PROMPT`, `PRESS_KEYS` and the validator limits rely on a manual `PROMPT_VERSION` bump; cached plans aren't re-validated. Consider hashing the system prompt into the key and re-running `validatePlan` on hits.
- **Routes:** the same path scouted under two identities can take both route slots; `goto` then doesn't say which identity. Prefer one identity per path, or add identity to `goto` (F06).
- **Prompt:** the 10-assertion and 300-character limits aren't stated in `SYSTEM_PROMPT`, so a model can waste its retry on them.
- **Validation:** `api.path` like `/\evil.test/x` passes; URL resolution treats `\` as `/`. The D-18 guard blocks it at runtime; also reject `\` at compile time.
- **D-09 scope:** criterion text and app snapshots go into prompts verbatim, so a Halloween-flavoured app or this repo's own spec can put theme words in a prompt. Our own framing stays clean (tested). Decide whether Req 5.6 means "our framing" and say so.
- **Next action:** fix the write and duplicate-persona items when F09 wires `compile()` into `summon`; the rest when F06 consumes plans or the KI-34 live run shows them.

