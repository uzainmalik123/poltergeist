# F04 Core Personas & Input Generators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `@poltergeist/core` exposes the three core personas (Wraith, Banshee, Doppelgänger) as frozen plain data and a pure `generate(generatorId, seed, index)` that returns the same input value every time (Requirement 4.1–4.2).

**Architecture:** One folder, `packages/core/src/personas/`. `steps.ts` pins the DSL step vocabulary that F05 will build its zod enum from. `generators/` holds eight pure generators behind one `generate()` entry point. Selection uses a 32-bit integer mix of `(seed, index)`: no `Math.random`, no clock. The naughty-strings list is vendored verbatim from BLNS (MIT) and parsed once, with injection sections excluded. `registry.ts` holds the persona data. Everything returned is deep-frozen.

**Tech Stack:** TypeScript 5.9.3, Node ≥ 22, fast-check 4.10.2 (runtime dependency, pinned exactly), vitest 4.1.12.

**Spec:** `.kiro/specs/poltergeist/requirements.md` Req 4.1–4.2 · `design.md` §4 (`Persona` type), §6 (step list), §7 (persona table) · `docs/PRD.md` F04 · `docs/DECISIONS.md` D-04, D-08, D-09, D-13, D-31 (written in Task 6) · grill decisions Q1–Q13 (this session).

## Global Constraints

- Fresh code only (D-25). Never open `../../../poltergeist-old`.
- Versions pinned exactly (`npm i -E`). Update STACK.md's "Installed here?" column.
- `npm run health` stays green after every task (D-19).
- Personas are plain data, and generators are pure functions (PRD F04). Nothing reads `Math.random`, `Date` or global state.
- `behaviour` and generator `description` strings go into LLM prompts later, so they use plain QA wording with no theme words (D-09). `name` and `tagline` are UI-only and may be themed.
- Core persona ids: `wraith`, `banshee`, `doppelganger`. Display names: `Wraith`, `Banshee`, `Doppelgänger`.
- Seed and index are uint32 integers (`0 … 2**32 - 1`); anything else throws `RangeError`.
- `long` is exactly 10,000 characters (design §7).
- BLNS is vendored verbatim (upstream commit `db33ec7b1d5d9616a88c76394b7d0897bd0b97eb`) with its MIT licence next to it.
- Commit messages are `F04: <what>`.
- Tests live in `packages/core/test/personas/`, mirroring `src/personas/`. The folder exports through `src/personas/index.ts`, and `src/index.ts` re-exports it.

## Review Focus

1. **Seed or index out of range** (`-1`, `1.5`, `NaN`, `2**32`, `Infinity`) must throw `RangeError`, never quietly produce a different value. Pinned in Task 1.
2. **Ids read from JSON at runtime** (`'Wraith'`, `'__proto__'`, `'toString'`) must throw `UnknownPersonaError` / `UnknownGeneratorError`, never resolve through the prototype chain. Pinned in Tasks 1 and 4.
3. **BLNS section headers come in two styles** (`#\tScript Injection` and `#      XXE Injection (XML)`). Every excluded section must still be found and dropped. Pinned in Task 2.
4. **BLNS lines that are blank-looking but not empty** (whitespace-only, NEL, BOM) are values, not separators. Only a truly empty line separates. Pinned in Task 2.
5. **A caller mutating a returned persona** (`persona.allowedSteps.push(...)`) must not change what the next `getPersona` returns. Pinned in Task 4.

---

## File Structure

```
packages/core/package.json                    + fast-check 4.10.2
packages/core/src/index.ts                    + export * from './personas/index.js'
packages/core/src/personas/
  index.ts                                    public exports
  errors.ts                                   UnknownPersonaError, UnknownGeneratorError
  steps.ts                                    STEP_TYPES, StepType
  registry.ts                                 PERSONA_IDS, persona data, getPersona, listPersonas, isPersonaId
  generators/
    index.ts                                  GENERATOR_IDS, GeneratorId, generate, listGenerators, isGeneratorId
    mix.ts                                    mix32, pickIndex, assertUint32
    lists.ts                                  plain, emoji, rtl, long, empty, whitespace
    naughty.ts                                BLNS parser + exclusions
    fastcheck.ts                              seeded fast-check string
    data/blns.txt                             vendored verbatim
    data/LICENSE-blns                         upstream MIT licence, verbatim
packages/core/test/personas/
  generators.test.ts  naughty.test.ts  fastcheck.test.ts  registry.test.ts  determinism.test.ts
  __snapshots__/determinism.test.ts.snap     committed
```

Shared test helper (inline in each test that needs it, it's two lines): `THEME_WORDS = ['ghost','haunt','spirit','spook','poltergeist','wraith','banshee','doppel','lich','revenant','changeling','possess','exorcis','seance','séance','curse','undead']`, matched case-insensitively as substrings.

---

### Task 1: Generator core and the six list generators

**Files:**
- Create: `packages/core/src/personas/errors.ts`, `generators/index.ts`, `generators/mix.ts`, `generators/lists.ts`, `packages/core/src/personas/index.ts`
- Test: `packages/core/test/personas/generators.test.ts`

**Interfaces:**
- Produces:
  - `GENERATOR_IDS = ['plain','naughty','emoji','rtl','long','empty','whitespace','fastcheck'] as const`, `type GeneratorId`
  - `isGeneratorId(id: string): id is GeneratorId` (own-key check, not `in`)
  - `generate(id: string, seed: number, index: number): string`
  - `listGenerators(): readonly GeneratorInfo[]`, `type GeneratorInfo = { readonly id: GeneratorId; readonly description: string }`
  - `mix32(x: number): number` (uint32 → uint32), `pickIndex(n: number, seed: number, index: number): number`, `assertUint32(name: 'seed' | 'index', v: number): void`
  - `class UnknownGeneratorError extends Error { readonly id: string }`, `class UnknownPersonaError extends Error { readonly id: string }` (same style as `SpecNotFoundError`, with `override readonly name`)
- In this task, `naughty` and `fastcheck` are registered with a temporary implementation that throws `Error('not implemented')`. Tasks 2 and 3 replace it. Their `description` is final now.

- [ ] **Step 1: Write the failing tests** in `generators.test.ts`:
  - `generate('empty', s, i) === ''` for a few (s, i).
  - `plain` matches `/^[a-z]+\d{4}$/`. Indices 0–15 for seed 7 give ≥ 8 distinct values.
  - `long` has `.length === 10_000` and matches `/^[A-Za-z0-9]+$/`.
  - `whitespace`: every value for indices 0–20 is non-empty and matches `/^[\s​]+$/u`. The set includes `'\t'`, `' '`, `'​'` and `'　'`.
  - `emoji`: across indices 0..n-1, the set includes a ZWJ sequence (`/‍/`), a skin-tone modifier (`/[\u{1F3FB}-\u{1F3FF}]/u`), a flag (two regional indicators, `/[\u{1F1E6}-\u{1F1FF}]{2}/u`), a keycap (`/⃣/`) and one value mixing emoji with ASCII letters.
  - `rtl`: the set includes a value with `‮`, one Arabic (`/[؀-ۿ]/`), one Hebrew (`/[֐-׿]/`) and one mixing Latin with Hebrew or Arabic.
  - For list generators, consecutive indices `0..n-1` from one seed give `n` distinct values (n = list length), and index `n` wraps to index `0`'s value.
  - `generate('wraith', 0, 0)`, `generate('__proto__', 0, 0)` and `generate('toString', 0, 0)` throw `UnknownGeneratorError`, with `.id` set.
  - For each of `-1, 1.5, NaN, Infinity, 2**32` as seed and as index: throws `RangeError` whose message names `seed` or `index`.
  - `listGenerators()` returns the ids in `GENERATOR_IDS` order, each with a non-empty description and no `THEME_WORDS`. The array and its items are frozen (`Object.isFrozen`).
  - `mix32(0) !== mix32(1)`, and the result is always an integer in `[0, 2**32)`.

- [ ] **Step 2: Run them to see them fail**
  Run: `npx vitest run packages/core/test/personas/generators.test.ts`
  Expected: FAIL (module not found)

- [ ] **Step 3: Implement**
  - `mix32`: the murmur3 `fmix32` finaliser, using `Math.imul` and `>>> 0`.
  - `pickIndex(n, seed, index) = ((mix32(seed) % n) + (index % n)) % n`.
  - `generate` calls `assertUint32` for seed and index first, then the id check, then dispatches through a `Map<GeneratorId, (seed, index) => string>`.
  - `lists.ts`: frozen arrays for `emoji` (≈ 12 entries), `rtl` (≈ 8) and `whitespace` (≈ 10: `' '`, `'   '`, `'\t'`, `'\n'`, `'\r\n'`, `' '`, `'​'`, `'　'`, `' '`, `' \t\n '`), each picked with `pickIndex`.
  - `plain` = `WORDS[pickIndex(16, seed, index)] + String(1000 + (mix32((seed ^ mix32(index)) >>> 0) % 9000))`, where `WORDS` holds 16 neutral lowercase words (apple, maple, river, stone, cedar, amber, lemon, otter, pearl, tulip, cobalt, willow, harbor, meadow, copper, violet).
  - `long` repeats the 62-char alphanumeric alphabet, rotated by `pickIndex(62, seed, index)`, and truncates to 10,000.
  - Descriptions (exact copy):
    - plain: `Short ordinary alphanumeric text, for filling a field with a valid everyday value.`
    - naughty: `Strings known to break input handling: reserved words, numeric-looking text, special and control characters, unusual Unicode.`
    - emoji: `Emoji, including multi-codepoint sequences, skin tones, flags and keycaps.`
    - rtl: `Right-to-left text (Arabic, Hebrew), mixed-direction text and direction override characters.`
    - long: `A 10,000-character string, for length limits and layout overflow.`
    - empty: `An empty string.`
    - whitespace: `Whitespace-only values, including tabs, newlines, non-breaking and zero-width spaces.`
    - fastcheck: `A random but reproducible Unicode string of up to 64 characters.`
  - `personas/index.ts` re-exports the errors and the generators API (not `mix.ts`).

- [ ] **Step 4: Run the tests**
  Run: `npx vitest run packages/core/test/personas/generators.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add packages/core/src/personas packages/core/test/personas/generators.test.ts
  git commit -m "F04: generator core (plain, emoji, rtl, long, empty, whitespace)"
  ```

### Task 2: Vendored naughty strings

**Files:**
- Create: `generators/naughty.ts`, `generators/data/blns.txt`, `generators/data/LICENSE-blns`
- Modify: `generators/index.ts` (wire in `naughty`)
- Test: `packages/core/test/personas/naughty.test.ts`

**Interfaces:**
- Consumes: `pickIndex` (Task 1)
- Produces:
  - `parseBlns(text: string): { sections: readonly { title: string; values: readonly string[] }[] }` (exported from `naughty.ts` for tests, not from the package index)
  - `EXCLUDED_SECTIONS: readonly string[]`
  - `naughtyValues(): readonly string[]` (lazy, cached, frozen)

- [ ] **Step 1: Vendor the files**
  ```bash
  D=packages/core/src/personas/generators/data; mkdir -p $D
  curl -fsSL -o $D/blns.txt https://raw.githubusercontent.com/minimaxir/big-list-of-naughty-strings/db33ec7b1d5d9616a88c76394b7d0897bd0b97eb/blns.txt
  curl -fsSL -o $D/LICENSE-blns https://raw.githubusercontent.com/minimaxir/big-list-of-naughty-strings/db33ec7b1d5d9616a88c76394b7d0897bd0b97eb/LICENSE
  ```
  Expected: `blns.txt` is 742 lines, and `LICENSE-blns` starts with `The MIT License (MIT)`.

- [ ] **Step 2: Write the failing tests** in `naughty.test.ts`:
  - `parseBlns` of the vendored file finds a section for every title in `EXCLUDED_SECTIONS`. `EXCLUDED_SECTIONS` is exactly `['Script Injection','SQL Injection','Server Code Injection','Command Injection (Ruby)','XXE Injection (XML)','File Inclusion','Known CVEs and Vulnerabilities','Terminal escape codes','iOS Vulnerabilities']`.
  - It also finds `Reserved Strings`, `Emoji` and `Right-To-Left Strings`.
  - A small inline sample (`'#\tA\n#\tdesc\n\nx\n \n\n#      B\n#\ny\n'`) parses to sections `A: ['x', ' ']` and `B: ['y']`. This proves whitespace-only lines are values and space-indented headers are recognised.
  - `naughtyValues()` has more than 250 entries. None contains `<script`, `DROP TABLE`, `%x(` or `\u001b[` (escape sequences). It contains `'undefined'`, `'NaN'` and at least one whitespace-only value.
  - `generate('naughty', s, i)` is always a member of `naughtyValues()`, and is identical on repeat calls.
  - `LICENSE-blns` exists and contains `Max Woolf`.

- [ ] **Step 3: Run them to see them fail**
  Run: `npx vitest run packages/core/test/personas/naughty.test.ts`
  Expected: FAIL

- [ ] **Step 4: Implement**
  - Read the file with `readFileSync(new URL('./data/blns.txt', import.meta.url), 'utf8')` and split on `/\r?\n/`.
  - A **header** is a line starting with `#` that is the first line of the file or follows a truly empty line (`''`). Its title is the line with the leading `#` and whitespace stripped.
  - Other `#` lines are comments. A non-`#` line that isn't `''` is a value of the current section.
  - Drop sections whose title is in `EXCLUDED_SECTIONS`, then flatten, dedupe and freeze.

- [ ] **Step 5: Run the tests and the Task 1 tests**
  Run: `npx vitest run packages/core/test/personas`
  Expected: PASS

- [ ] **Step 6: Commit**
  ```bash
  git add packages/core/src/personas/generators packages/core/test/personas/naughty.test.ts
  git commit -m "F04: vendored naughty strings (BLNS, MIT) without injection sections"
  ```

### Task 3: Seeded fast-check generator

**Files:**
- Create: `generators/fastcheck.ts`
- Modify: `packages/core/package.json`, `package-lock.json`, `generators/index.ts`, `docs/STACK.md` (mark fast-check installed, 4.10.2)
- Test: `packages/core/test/personas/fastcheck.test.ts`

**Interfaces:**
- Consumes: `mix32` (Task 1)
- Produces: `fastcheckValue(seed: number, index: number): string`

- [ ] **Step 1: Install** with `npm i -E -w @poltergeist/core fast-check@4.10.2`
  Expected: `"fast-check": "4.10.2"` under `dependencies`.

- [ ] **Step 2: Write the failing tests**:
  - The same `(seed, index)` gives the same value.
  - Values have at most 64 graphemes (`[...new Intl.Segmenter().segment(v)].length <= 64`).
  - Indices 0–19 for seed 1 give at least 10 distinct values.
  - `(1, 0)` and `(2, 0)` differ.

- [ ] **Step 3: Run them to see them fail**
  Run: `npx vitest run packages/core/test/personas/fastcheck.test.ts`
  Expected: FAIL

- [ ] **Step 4: Implement**
  ```ts
  fc.sample(fc.string({ unit: 'grapheme', maxLength: 64 }), { seed: mix32((seed ^ mix32(index)) >>> 0) | 0, numRuns: 1 })[0]
  ```
  Build the arbitrary once at module level.

- [ ] **Step 5: Run the tests**
  Run: `npx vitest run packages/core/test/personas`
  Expected: PASS

- [ ] **Step 6: Commit**
  ```bash
  git add packages/core/package.json package-lock.json packages/core/src/personas/generators packages/core/test/personas/fastcheck.test.ts docs/STACK.md
  git commit -m "F04: seeded fast-check generator"
  ```

### Task 4: Step vocabulary and the three core personas

**Files:**
- Create: `packages/core/src/personas/steps.ts`, `registry.ts`
- Modify: `packages/core/src/personas/index.ts`
- Test: `packages/core/test/personas/registry.test.ts`

**Interfaces:**
- Consumes: `GENERATOR_IDS`, `GeneratorId`, `UnknownPersonaError` (Task 1)
- Produces:
  - `STEP_TYPES = ['goto','click','dblclick','fill','press','back','reload','wait','throttle','barrier','holdRequests','releaseRequests','login','logout'] as const`, `type StepType`
  - `PERSONA_IDS = ['wraith','banshee','doppelganger'] as const`, `type PersonaId`
  - `type Persona = { readonly id: PersonaId; readonly name: string; readonly tagline: string; readonly behaviour: string; readonly allowedSteps: readonly StepType[]; readonly generators: readonly GeneratorId[]; readonly actors: 1 | 2; readonly sprite: string }`
  - `getPersona(id: string): Persona` (throws `UnknownPersonaError`), `listPersonas(): readonly Persona[]` (in `PERSONA_IDS` order), `isPersonaId(id: string): id is PersonaId`

- [ ] **Step 1: Write the failing tests** in `registry.test.ts`:
  - `listPersonas().map(p => p.id)` equals `['wraith','banshee','doppelganger']`, with names `['Wraith','Banshee','Doppelgänger']`.
  - Each persona has `sprite === id`.
  - Exact allocations:
    - wraith steps `['goto','click','dblclick','fill','press','back','reload','wait']`, generators `['plain']`, actors 1.
    - banshee steps `['goto','click','fill','press','wait']`, generators `['naughty','emoji','rtl','long','empty','whitespace','fastcheck']`, actors 1.
    - doppelganger steps `['goto','click','fill','press','reload','wait','barrier','holdRequests','releaseRequests']`, generators `['plain']`, actors 2.
  - Integrity: every step is in `STEP_TYPES`, every generator is in `GENERATOR_IDS`, there are no duplicates within a list, and ids are unique.
  - None of the core three allows `throttle`, `login` or `logout` (those are F16).
  - `tagline` is non-empty, a single line and ≤ 80 chars.
  - `behaviour` is ≥ 80 chars and contains no `THEME_WORDS`.
  - `getPersona('Wraith')`, `getPersona('__proto__')`, `getPersona('toString')` and `getPersona('lich')` throw `UnknownPersonaError`, with `.id` set.
  - The returned persona, its `allowedSteps` and its `generators` are frozen. `getPersona('wraith').allowedSteps.push` throws `TypeError`, and a second `getPersona('wraith')` is unchanged.
  - `STEP_TYPES` has length 14 and is frozen.

- [ ] **Step 2: Run them to see them fail**
  Run: `npx vitest run packages/core/test/personas/registry.test.ts`
  Expected: FAIL

- [ ] **Step 3: Implement**
  Persona data is deep-frozen with `Object.freeze`. Lookup goes through a `Map`. Exact copy:
  - **Wraith.** tagline `Double-clicks, resubmits and reloads mid-request.` · behaviour `An impatient user. Double-clicks buttons, submits the same form twice, and presses Back or reloads the page while a request is still in flight. Checks that the action happened exactly once and the page is not left stuck or inconsistent.`
  - **Banshee.** tagline `Screams naughty strings, emoji and RTL into every field.` · behaviour `A user who enters unusual input. Fills text fields with edge-case values (special characters, emoji, right-to-left text, very long text, empty or whitespace-only values). Checks that the app validates them, shows a clear message, and neither crashes nor stores corrupted data.`
  - **Doppelgänger.** tagline `Two tabs, one account, racing for the same thing.` · behaviour `The same user signed in from two browser tabs at once. Both tabs perform the same action at the same moment, lined up with a barrier and held requests. Checks that the app stays consistent, for example that an item can only be claimed once.`
  - Export from `personas/index.ts`: `STEP_TYPES`, `StepType`, `PERSONA_IDS`, `PersonaId`, `Persona`, `getPersona`, `listPersonas`, `isPersonaId`.

- [ ] **Step 4: Run the tests**
  Run: `npx vitest run packages/core/test/personas`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add packages/core/src/personas packages/core/test/personas/registry.test.ts
  git commit -m "F04: step vocabulary and core personas (Wraith, Banshee, Doppelganger)"
  ```

### Task 5: Determinism snapshot (Done-when) and package export

**Files:**
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/personas/determinism.test.ts`, `__snapshots__/determinism.test.ts.snap` (generated, committed)

**Interfaces:**
- Consumes: everything above, imported from `../../src/index.js` (proves the package export).

- [ ] **Step 1: Write the test**
  - **Snapshot:** for every id in `GENERATOR_IDS` × seeds `[0, 1, 42]` × indices `0..4`, build `{ [`${id}/${seed}/${index}`]: value }`. `long` values are stored as `` `len=${v.length} sha256=${sha256(v).slice(0, 16)}` `` so the snapshot stays small. Then `expect(table).toMatchSnapshot()`.
  - **Property:** `fc.assert(fc.property(fc.constantFrom(...GENERATOR_IDS), fc.nat({max: 2**32-1}), fc.nat({max: 2**32-1}), (id, s, i) => generate(id, s, i) === generate(id, s, i)))`.
  - **Order independence:** generating the 120-entry table in reverse order gives the same values.
  - **Exports:** `listPersonas` and `generate` are importable from the package index.

- [ ] **Step 2: Run it to see it fail**
  Run: `npx vitest run packages/core/test/personas/determinism.test.ts`
  Expected: FAIL (`listPersonas` is not exported from `src/index.ts`)

- [ ] **Step 3: Add `export * from './personas/index.js';` to `packages/core/src/index.ts`**

- [ ] **Step 4: Run it twice, to write and then check the snapshot**
  Run: `npx vitest run packages/core/test/personas/determinism.test.ts && npx vitest run packages/core/test/personas/determinism.test.ts`
  Expected: the first run writes 1 snapshot, the second passes with no snapshot changes.

- [ ] **Step 5: Run the health gate**
  Run: `npm run health`
  Expected: exit 0

- [ ] **Step 6: Commit**
  ```bash
  git add packages/core/src/index.ts packages/core/test/personas/determinism.test.ts packages/core/test/personas/__snapshots__
  git commit -m "F04: determinism snapshot and package export"
  ```

### Task 6: Spec and docs

**Files:**
- Modify: `.kiro/specs/poltergeist/requirements.md` (4.1: "ASCII sprite" → "sprite reference resolved by the Costume Kit", and add "a one-line tagline"), `.kiro/specs/poltergeist/design.md` §4 (`Persona` type gains `tagline`, and `sprite: string` becomes a sprite id; add `GeneratorId` and a note that `STEP_TYPES` lives in `core/personas`), `docs/DECISIONS.md` (D-31), `docs/KNOWN_ISSUES.md` (KI-32), `docs/PRD.md` (F04 → Done + changelog), `.kiro/specs/poltergeist/tasks.md` (tick F04), `AGENTS.md` (current state)

- [ ] **Step 1: Write D-31** "F04 persona and generator rulings":
  - persona ids come from the registry;
  - sprite is a reference;
  - `name`/`tagline` are UI-only and `behaviour`/descriptions are plain QA (tested);
  - `STEP_TYPES` lives in F04;
  - the eight generators, including `plain`;
  - seed and index are uint32;
  - the list-pick rule;
  - BLNS is vendored at commit `db33ec7`, minus the nine injection/vulnerability sections (D-08, F25);
  - the per-persona allocation.

  Add it to the summary table too.
- [ ] **Step 2: Write KI-32** "Typed inputs (numbers, emails, dates) may be needed for valid form fills, and DSL `literal` input vs D-04 is unresolved". Minor, blocks F05 and the spike. Next action: the KI-01 spike counts how often plans needed a typed value. Add it to the summary table.
- [ ] **Step 3: Update PRD, tasks.md and AGENTS.md** (F04 Done, with a changelog line).
- [ ] **Step 4: Run `npm run health`.** Expected: exit 0.
- [ ] **Step 5: Commit** `F04: close cycle (spec, D-31, KI-32, PRD, tasks, AGENTS)`.
