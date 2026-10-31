# Poltergeist: Lessons from the prototype

> The prototype (`../poltergeist-old`, private, built 2026-10-30 before the hacking window) got through F01–F03 in about a day: ~36 commits, 236 tests, CI green. This repo rebuilds from scratch (D-25). **This file is the bridge:** what worked, what bit us, and what to build right the first time. It contains no code on purpose. Grill each feature with its section open.

## Process lessons

1. **The cycle works.** Grill → plan → implement → review produced F01–F03 quickly, with decisions written down as they were made. Keep it.
2. **Build the demo target first.** F03 needed a stand-in fixture app because Candy Swap (F10) didn't exist, and its Done-when then had to be amended (D-20). Now F10 comes before F03.
3. **Test the riskiest assumption early.** After three features, KI-01 ("can the LLM compile criteria into good plans?") was still untested. Now there's a spike before F05.
4. **Time-box safety hardening.** F02's network guard took the most review rounds (D-17, D-18, D-22, KI-17 to KI-23). The final design is known now, so build it directly and don't rediscover it.
5. **Reviews find real holes, so keep them on safety features.** The final reviews found that a redirect could reach cloud metadata (`169.254.169.254`) and that WebRTC UDP bypassed the guard.
6. **Reproduce before you fix flakes.** KI-23's first "fix" (longer timeouts) was wrong. Pinning the tests to one CPU (`taskset -c 0 npx vitest run test/safety`) reproduced it 4 times out of 5, and an event log showed the real cause. Make the one-CPU run part of F02's Done-when.
7. **A green health gate from commit one.** `npm run health` plus CI caught the load-only failure the day it appeared (D-19).

## F01: Spec Reader

**Build it to D-16 directly.**
- IDs are `N.M`, from the `Requirement N` number and the list number. Duplicates become `Nb`, `Nc`.
- The hash is over normalized text only.
- EARS is classified by keywords with the priority IF > WHEN > WHILE > WHERE > ubiquitous. Keywords count in any case only at the start of the text or after a comma.
- The `subject` is the noun between THE and SHALL.

**What real specs look like:** the Reanimator spec uses `### Requirement N: Title`, sometimes no `#### Acceptance Criteria`, `THE <Component> SHALL`, and criteria with two SHALLs (still one criterion). Kiro's tasks cite `_Requirements: 1.1, 2.3_`.

**Warnings that kept criteria from being dropped silently:** `no-criteria` (bulleted lists), `ignored-list`, `unrecognized-heading` (`Requirement #3`), `empty-spec`.

**Fixtures:** a Candy Swap draft, the Reanimator spec, a messy spec, CRLF line endings, a stability test (re-parse gives the same IDs), and 200 criteria in < 200 ms. New this time: **this repo's own `.kiro/specs/poltergeist/requirements.md`.**

**Known edge cases to decide during the grill (KI-16):**
- more than 26 duplicate requirement numbers;
- `Requirement 1a`;
- code blocks and tables inside a criterion;
- `IF-Match` being read as IF;
- a lowercase `the` subject with no comma;
- specs inside a blockquote.

## F02: Target Config & Safety

**Build to D-17 + D-18 + D-22 from the start.** The parts that took the longest to discover:

- **Playwright's `context.route` never sees redirect hops.** `route.fetch({maxRedirects:0})` leaked on multi-hop chains and buffered responses, which is bad for race testing. Don't use it.
- **The dead-proxy backstop** is the real guard: a per-context `proxy.server` on `127.0.0.1:0` (nothing listening) with a bypass list of loopback and `allowedHosts`.
- **`<-loopback>` must be the first bypass entry.** Without it, Chromium implicitly bypasses the proxy for all of `127/8`, `::1`, `169.254/16` and `fe80::/10`, and a redirect reached `169.254.169.254`. Bypass rules are last-match-wins, so the allowlisted hosts after it still bypass.
- **WebRTC:** launch with `--force-webrtc-ip-handling-policy=disable_non_proxied_udp`, and use an init script that disables `RTCPeerConnection`.
- **Reporting redirect hops:**
  - `requestfailed` with `ERR_PROXY_CONNECTION_FAILED` or `ERR_BLOCKED_BY_CLIENT` → `host`.
  - The same error on an *allowlisted original* request → `redirect` (Chromium under load hides the hop, KI-23).
  - Anything else unconfirmed → `leak`.
- **Abort or close first, then call `onBlocked`, and swallow its errors.**
- **`newGuardedContext` is the single entry point.** Reject caller `proxy` and `serviceWorkers` overrides.

**Do these in the first pass this time (from KI-21):**
- Redact reset output *before* trimming it to 64 KB.
- Pass the loader's `env` to `runReset`.
- Validate `guardContextOptions` entries (a direct `,` `<` `*` could widen the bypass), or make it internal.
- Tighten the IPv6 pattern in `allowedHosts`.
- Redact issue paths as well as messages.
- Precompile `forbidden` regexes once per rule list.
- Carry the browser's `errorText` on `BlockedRequest`.
- Expect `ERR_ABORTED` mid-redirect to show up as `leak` (conservative).
- Decode paths before `forbidden` matching (KI-17).

**Tests the prototype was missing:**
- redirects through `localhost` and `[::1]`;
- IPv4 and `::1` entries in `allowedHosts`;
- bounds on `reps` and `resetTimeoutMs`;
- an empty `resetCommand`;
- nested strictness;
- a route naming a missing account;
- `http://localhost@evil.com` and trailing-dot targets;
- the reset trim, tail and `spawn` failure;
- `forbidden` first-match and lowercase methods;
- a limiter task that throws synchronously;
- a non-empty `allowedHosts` guard test;
- the secret-in-reset-output test through `$POLTERGEIST_PW`.

**Open issues to settle when F06 arrives:** KI-18, KI-19 and KI-20.

## F03: Route Scout

**Build it to D-20 + D-21.** The rulings that came from bugs:

- **The `target` is an origin only.** Base-path targets broke path comparisons and login detection.
- **Emit a `label` only when exact `getByLabel` resolves exactly one element.** Drop testIds whose value changes under redaction. testId lookups use a 250 ms timeout and are skipped on failure.
- **Budgets:**
  - A hard per-route `routeTimeoutMs`, with capture's 20% share reserved up front.
  - The interactive JSON is trimmed to at most 75% of the character budget, and the snapshot is then fitted by JSON-escaped length.
  - After a capture timeout, open a fresh page in the same context (cookies kept).
- **No summary file in `scout/`.** `index.json` is the `/` route. The caller writes `run.json`.
- **Login:** session-lost detection is exact pathname equality with `loginRoute`. `routeHash` includes `count`, so duplicate names change it.
- **Redact** `finalPath` and blocked URLs.

**Do these in the first pass this time (from KI-22):**
- A better login-success check (`/login/failed` fooled "left loginRoute").
- Don't wait out the full timeout on a clearly failed login.
- Catch only timeouts in `waitForURL`.
- `count()` the `fields` overrides.
- Redact the blocked `host` and percent-encoded secrets.
- Reject `user:pass@` targets.
- Trim non-timeout capture errors to one line.
- Unescape aria names fully.
- Handle duplicate testIds.
- Make testId capture concurrent-safe, with a per-id try/catch.
- Don't cut the trim mid-escape.
- Derive `KEY_OVERHEAD` instead of hard-coding it.

## Things that didn't change

- **The core design held up:** the DSL-only LLM (D-03), deterministic inputs (D-04), the allowlist (D-05), reproducible verdicts (D-06), the concurrency cap (D-07), QA-only scope (D-08) and plain prompts (D-09).
- **The order of the core loop** (F04 → F05 → F06 → F07 → F08 → F09 → F11 → F12) is unchanged, apart from the spike and F26.
