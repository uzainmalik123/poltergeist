# Scaffold + F01 Spec Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A green `npm run health` monorepo (build order 0), and `@poltergeist/core`'s Spec Reader, which turns a Kiro `requirements.md` into `{criteria, warnings}` (Requirement 1).

**Architecture:** npm workspaces with a single `packages/core` for now. The Spec Reader parses markdown to mdast with `unified` + `remark-parse` and walks the top-level nodes: `Requirement N` headings, then each one's first ordered list. EARS classification is a pure keyword module, and hashing is a pure `node:crypto` helper. `parseRequirements` (pure, never throws) is wrapped by `parseSpec` (reads the file, throws `SpecNotFoundError`).

**Tech Stack:** TypeScript 5.9.3 (ESM, NodeNext), Node ≥ 22, vitest 4.1.12, eslint 9.39.1 + typescript-eslint 8.72.1, unified 11.0.5, remark-parse 11.0.0, mdast-util-to-string 4.0.0, @types/mdast 4.0.4, @types/node 22.20.5.

**Spec:** `.kiro/specs/poltergeist/requirements.md` Requirement 1 · `design.md` (Criterion types) · `docs/DECISIONS.md` D-16, D-19, D-27 · `docs/PRD.md` Scaffold + F01.

## Global Constraints

- Versions pinned exactly (no `^`), as listed in STACK.md. Mark them `Installed here? yes` in STACK.md.
- `npm run health` = `npm run typecheck && npm run lint && npm test` (D-19).
- CI: GitHub Actions on Node 22, on push to `main` and on PRs. Steps are `npm ci`, then `npm run health` (no Chromium step until browser tests exist). No secrets.
- No code from `../poltergeist-old` (D-25). The LLM is never used for parsing (D-03, Req 1.5).
- Content never throws. Only a missing or unreadable file throws `SpecNotFoundError` (Req 1.7, 1.8).
- Parse 200 criteria in < 200 ms.
- Tests live in `packages/core/test/`, mirroring `src/`. Each module exports through its folder's `index.ts`.

## Review Focus

1. **The same requirement title separators in other forms** (`Requirement 3 – Title`, `## requirement 3.`, `Requirement 3` with no title) must all produce requirement `3`. Pinned in Task 4, `heading variants`.
2. **An ordered list under a deeper non-requirement heading** (`#### Notes` with `1.` items) after the criteria list must produce `ignored-list`, not extra criteria. Pinned in Task 4.
3. **A file with a BOM or CRLF** must give the same IDs and hashes as LF. Pinned in Task 5.
4. **Criterion text containing inline code or links** (`` `SpecNotFoundError` ``, `[x](y)`) must be kept as plain text without markdown syntax. Pinned in Task 4.
5. **A list starting at a number other than 1** (`3.`) must give IDs from `start` (`N.3`). Pinned in Task 4.

---

## File Structure

```
package.json                      workspaces, scripts (typecheck, lint, test, health), devDeps
tsconfig.base.json                strict, ES2023, module/moduleResolution NodeNext, noEmit
tsconfig.json                     extends base; include packages/*/src, packages/*/test
eslint.config.js                  @eslint/js recommended + typescript-eslint recommended
vitest.config.ts                  include packages/*/test/**/*.test.ts
.github/workflows/ci.yml
packages/core/package.json        @poltergeist/core, type module, exports ./src/index.ts, deps
packages/core/src/index.ts        export * from './spec/index.js'
packages/core/src/spec/types.ts   Criterion, EarsKind, EarsClauses, SpecWarning, SpecWarningCode, ParsedSpec
packages/core/src/spec/errors.ts  SpecNotFoundError
packages/core/src/spec/hash.ts    normalizeText, criterionHash
packages/core/src/spec/ears.ts    classifyEars
packages/core/src/spec/parse.ts   parseRequirements
packages/core/src/spec/read.ts    parseSpec
packages/core/src/spec/index.ts
packages/core/test/...            mirrors src; fixtures in test/fixtures/spec/<name>/requirements.md
```

---

### Task 1: Scaffold and health gate

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `tsconfig.json`, `eslint.config.js`, `vitest.config.ts`, `.github/workflows/ci.yml`, `packages/core/package.json`, `packages/core/src/index.ts`
- Test: `packages/core/test/smoke.test.ts`

**Interfaces:**
- Produces: the `@poltergeist/core` workspace and the scripts `typecheck` (`tsc -p tsconfig.json`), `lint` (`eslint .`), `test` (`vitest run`) and `health`.

- [ ] **Step 1:** Write the root and core `package.json` files (`"private": true`, `"type": "module"`, `"engines": {"node": ">=22"}`, `"workspaces": ["packages/*"]`) and install the pinned dev dependencies at the root with `npm i -D -E`. Ignore `dist`, `node_modules` and `coverage` in ESLint.
- [ ] **Step 2:** Write `smoke.test.ts`: `expect(1 + 1).toBe(2)` and that `import('../src/index.js')` resolves.
- [ ] **Step 3:** Run `npm run health`. Expected: exit 0, 1 file and 2 tests passed.
- [ ] **Step 4:** Write `ci.yml` (`actions/checkout@v4`, `actions/setup-node@v4` with `node-version: 22` and `cache: npm`, `npm ci`, `npm run health`).
- [ ] **Step 5:** Commit: `Scaffold: npm workspaces, health gate, CI`.

### Task 2: Types, error and hash

**Files:**
- Create: `packages/core/src/spec/{types.ts,errors.ts,hash.ts,index.ts}`
- Test: `packages/core/test/spec/hash.test.ts`

**Interfaces:**
- Produces:
  - `type EarsKind = 'event'|'state'|'unwanted'|'optional'|'ubiquitous'`
  - `type EarsClauses = { kind: EarsKind; trigger?: string; precondition?: string; subject?: string; response: string }`
  - `type Criterion = { id: string; requirement: string; requirementId: string; text: string; raw: string; line: number; kind: EarsKind|'freeform'; ears: EarsClauses|null; hash: string }`
  - `type SpecWarningCode = 'empty-spec'|'no-criteria'|'ignored-list'|'unrecognized-heading'|'duplicate-requirement'|'no-requirement-headings'`
  - `type SpecWarning = { code: SpecWarningCode; message: string; line?: number }`
  - `type ParsedSpec = { criteria: Criterion[]; warnings: SpecWarning[] }`
  - `class SpecNotFoundError extends Error { readonly path: string }`, with `name = 'SpecNotFoundError'`
  - `normalizeText(s: string): string` (NFC, `\s+` → one space, trimmed, case kept)
  - `criterionHash(text: string): string` (first 12 hex of sha256 over `normalizeText(text)`)

- [ ] **Step 1: Failing tests.** `normalizeText('  a\n\t b  ')` returns `'a b'`. `normalizeText('é')` returns `'é'`. `criterionHash` matches `/^[0-9a-f]{12}$/`. The hash is equal for `'A  b'` and `'A b'`, and differs for `'A b'` and `'a b'`.
- [ ] **Step 2:** Run `npx vitest run packages/core/test/spec/hash.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement the code. `normalizeText` covers trigger and case.
- [ ] **Step 4:** Run it again. Expected: PASS. Then `npm run health` is green.
- [ ] **Step 5:** Commit: `F01: spec types, SpecNotFoundError, criterion hash`.

### Task 3: EARS classifier

**Files:**
- Create: `packages/core/src/spec/ears.ts`
- Test: `packages/core/test/spec/ears.test.ts`

**Interfaces:**
- Produces: `classifyEars(text: string): { kind: EarsKind|'freeform'; ears: EarsClauses|null }`

**Algorithm (D-16, D-27):**
1. Find the first `\bshall\b` (any case). If there is none, return `{kind:'freeform', ears:null}`.
2. `head` = the text before it, `response` = the text after it (trimmed).
3. Split `head` into clauses at keyword positions. A keyword (`WHILE|WHEN|IF|WHERE|THEN`) counts if it is (a) upper case anywhere at a word boundary, or (b) any case at the start of `head` or right after a comma (optional whitespace). In both cases it must be followed by whitespace or a comma, so `IF-Match` is not IF.
4. Each clause's text runs to the next keyword, trimmed of surrounding commas and spaces. WHEN gives `trigger`. WHILE gives `precondition`. IF gives `trigger` (it is the unwanted condition). WHERE gives `precondition` (the feature). THEN is a separator.
5. `kind`: IF → unwanted, otherwise WHEN → event, otherwise WHILE → state, otherwise WHERE → optional, otherwise ubiquitous. If several clauses map to the same field, join them with `'; '`.
6. `subject`: in the final segment of `head` (after the last keyword, or the whole `head` if there is none), take the text after the last `\bthe\s+` (any case), trimmed. Leave it undefined if there is none.

- [ ] **Step 1: Failing tests** (`it.each` table of input → expected):
  - `'WHEN the user clicks Buy, THE Cart SHALL add the item.'` → event, trigger `'the user clicks Buy'`, subject `'Cart'`, response `'add the item.'`
  - `'IF the token is stale, THEN THE Server SHALL reject it.'` → unwanted, trigger `'the token is stale'`, subject `'Server'`
  - `'WHILE a run is in progress, THE Network_Guard SHALL block it.'` → state, precondition `'a run is in progress'`
  - `'WHERE dark mode is on, THE UI SHALL dim.'` → optional
  - `'THE Spec_Reader SHALL classify EARS kinds.'` → ubiquitous, subject `'Spec_Reader'`
  - `'When the user saves, the editor shall persist.'` → event, subject `'editor'` (lower case at the start)
  - `'the server shall drop requests when idle.'` → ubiquitous, subject `'server'` (lower-case "when" after SHALL is in the response)
  - `'THE Proxy SHALL forward the IF-Match header.'` → ubiquitous
  - `'Send IF-Match, THE Proxy SHALL reject.'` → ubiquitous (`IF-Match` doesn't count)
  - `'WHEN a, IF b, THE X SHALL y.'` → unwanted (priority)
  - `'The page should load fast.'` → freeform, ears null
  - `'THE A SHALL b and SHALL c.'` → ubiquitous, response `'b and SHALL c.'`
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement it with one regex scan over `head`, as in the algorithm.
- [ ] **Step 4:** Run it. Expected: PASS. `npm run health` is green.
- [ ] **Step 5:** Commit: `F01: deterministic EARS keyword classifier`.

### Task 4: `parseRequirements`

**Files:**
- Create: `packages/core/src/spec/parse.ts`
- Test: `packages/core/test/spec/parse.test.ts`

**Interfaces:**
- Consumes: `classifyEars`, `criterionHash`, `normalizeText`, the types.
- Produces: `parseRequirements(markdown: string): ParsedSpec`

**Rules (D-16, D-27):**
- Strip a leading BOM. Parse with `unified().use(remarkParse).parse(md)` and walk `root.children` in order.
- Requirement heading regex (on `toString(heading)`): `/^requirement\s+(\d+)(?:\s*[:.\-–—]\s*(.*)|\s*)$/i`. The title is group 2 trimmed, or `''`. A heading that starts with `/^requirement\b/i` but fails the regex (e.g. `Requirement 1a`, `Requirement #3`) gives `unrecognized-heading` and closes the current requirement.
- A requirement's scope ends at the next requirement heading or the next heading with depth ≤ its own. The first top-level `list` with `ordered: true` in scope gives the criteria. Later ordered lists in scope give one `ignored-list` warning each. A requirement with no ordered list gives `no-criteria` (this covers bullets and blockquotes).
- For each `listItem` at index i: `M = (list.start ?? 1) + i`. `text = normalizeText(toString of each child paragraph or other node, joined with ' ')`. Nested lists, code and tables are included because `toString` covers every child. `raw = md.slice(item.position.start.offset, item.position.end.offset)`. `line = item.position.start.line`.
- Duplicate `N`: the k-th occurrence (k ≥ 2) gets a suffix from `suffix(k)`: 2 → `b` … 26 → `z`, 27 → `aa`, 28 → `ab` (bijective base-26 over `k-1`, where index 1 = `b`, so that `a` is never used alone). Each gives a `duplicate-requirement` warning.
- No requirement headings anywhere, but some heading with an ordered list in scope: every such heading becomes a requirement numbered by position (1, 2, …), titled with its heading text, plus one `no-requirement-headings` warning.
- `empty-spec` if and only if the markdown (BOM stripped) is blank. A non-blank file with no requirement headings and no heading-scoped ordered lists gives one `no-criteria` warning with no `line`.
- No try/catch around the walk: bugs must surface in tests. "Never throws" is pinned by the seeded fuzz test below.

- [ ] **Step 1: Failing tests:**
  - **Basic:** two requirements, 3 and 2 criteria, giving IDs `['1.1','1.2','1.3','2.1','2.2']`, `requirement` = the title, `requirementId` `'1'`, and `line` correct.
  - **Heading variants:** `### Requirement 3: A`, `## requirement 4. B`, `#### Requirement 5 – C` and `### Requirement 6` all parse, with requirementIds 3, 4, 5, 6 and title `''` for 6.
  - **No `#### Acceptance Criteria` header:** a list directly under the requirement heading still parses. With the header, it also parses.
  - **Duplicates:** three `Requirement 2` headings give requirementIds `2`, `2b`, `2c`, IDs `2b.1`, and 2 `duplicate-requirement` warnings. A unit test of suffixes: k = 2, 26, 27, 28, 53 give `b`, `z`, `aa`, `ab`, `ba`.
  - **Bullets:** `- WHEN …` under a requirement gives 0 criteria and `no-criteria`.
  - **Second list:** a second ordered list gives `ignored-list`, and its items aren't criteria. Also under `#### Notes` after the criteria.
  - **`Requirement 1a` and `Requirement #3`:** `unrecognized-heading` with `line`, and no criteria from their lists.
  - **Blockquote:** a requirement whose list is inside `>` gives `no-criteria`.
  - **Freeform:** an item without SHALL is kept with kind `freeform`.
  - **Nested bullets** are folded into the parent's text. A code span keeps its content (`'Throw SpecNotFoundError.'` from `` Throw `SpecNotFoundError`. ``). A link keeps its text.
  - **`start`:** a list starting at `3.` gives `N.3`.
  - **No requirement headings:** `## Login` + an ordered list and `## Cart` + an ordered list give IDs `1.1` and `2.1` and `no-requirement-headings`.
  - **Empty:** `''` and `'  \n'` give `empty-spec` and 0 criteria.
  - **Never throws:** for 500 seeded pseudo-random strings built from markdown fragments (`#`, `Requirement 1`, `1.`, `-`, `>`, `` ``` ``, `|`, `\r\n`, letters), `parseRequirements` doesn't throw. Use a tiny inline LCG seed, not a new dependency.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement it. Add `unified`, `remark-parse`, `mdast-util-to-string` (deps) and `@types/mdast` (dev) to `packages/core`, pinned.
- [ ] **Step 4:** Run it. Expected: PASS. `npm run health` is green.
- [ ] **Step 5:** Commit: `F01: parseRequirements (D-16, D-27)`.

### Task 5: `parseSpec`, fixtures and Done-when

**Files:**
- Create: `packages/core/src/spec/read.ts`
- Create: `packages/core/test/fixtures/spec/reanimator/{requirements.md,NOTICE}` (copied from `../reanimator/.kiro/specs/reanimator/requirements.md`. NOTICE gives the MIT licence, `Copyright (c) 2026 Lanz Skyler B. Busa`, and the source path)
- Create: `packages/core/test/fixtures/spec/candy-swap-draft/requirements.md` (hand-written Kiro-style draft: ≥ 5 requirements for a candy marketplace with login, listing, swap offer, accept and inventory, using WHEN, IF/THEN, WHILE and a freeform item)
- Create: `packages/core/test/fixtures/spec/messy/requirements.md` (duplicate N, bullets, `Requirement #3`, `Requirement 1a`, a second list, a blockquote, a criterion without SHALL, `IF-Match`, a code block in a criterion)
- Test: `packages/core/test/spec/read.test.ts`, `packages/core/test/spec/fixtures.test.ts`

**Interfaces:**
- Produces: `parseSpec(specDir: string): Promise<ParsedSpec>`. It reads `path.join(specDir, 'requirements.md')` as UTF-8. Any read error (including ENOENT, or the path being a directory) throws `SpecNotFoundError(path)` with the cause attached.

- [ ] **Step 1: Failing tests:**
  - `read.test.ts`: a missing directory rejects with `SpecNotFoundError` and `.path` ending in `requirements.md`. A folder whose `requirements.md` is a directory also rejects.
  - `fixtures.test.ts`:
    - **Own spec** (`.kiro/specs/poltergeist`, resolved from the repo root): 0 warnings. Requirement 1 has 8 criteria. `'1.8'` exists and its text contains `SpecNotFoundError`. Every criterion with SHALL is non-freeform. The total equals the count of `^\d+\. ` lines under requirement headings, computed in-test.
    - **Reanimator:** 0 warnings, requirementIds `1`…`11`, total criteria 31.
    - **Candy draft:** 0 warnings, and the expected count (stated in the test, matching the fixture).
    - **Messy:** the exact multiset of warning codes is asserted, and the freeform and `IF-Match` criteria are present.
    - **Stability:** for each fixture, two parses are deep-equal. Inserting a new criterion at the top of requirement 1 changes `1.1`'s ID owner but keeps every original hash present.
    - **CRLF + BOM:** the own spec, converted to CRLF with a BOM, gives the same `id → hash` map and lines.
    - **Performance:** a generated spec of 20 requirements × 10 criteria (200) parses in < 200 ms (take the best of 3 runs, so warm-up doesn't count).
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement `read.ts`, export it, and write the fixtures.
- [ ] **Step 4:** `npm run health`. Expected: all green.
- [ ] **Step 5:** Commit: `F01: parseSpec, fixtures, Done-when tests`.

### Task 6: Close the cycle (docs)

- [ ] `docs/PRD.md`: Scaffold and F01 status `Done` (table and sections), plus a changelog line.
- [ ] `.kiro/specs/poltergeist/tasks.md`: tick 0 and 1.
- [ ] `docs/STACK.md`: mark the installed versions `yes`.
- [ ] `AGENTS.md` "Current state": scaffold + F01 done, next is F02.
- [ ] `npm run health` is green. Commit: `F01: close cycle (PRD, tasks, STACK, AGENTS)`.
