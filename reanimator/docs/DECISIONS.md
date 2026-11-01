# Reanimator: Decisions

> Decisions for the Reanimator app. IDs are `D-Rxx` to avoid clashing with Poltergeist's `D-xx`. To change a decision, don't edit it: add a new one and mark the old one `Superseded by D-Rxx`.
> Status: `Accepted` · `Proposed` · `Superseded`

| ID | Decision | Status |
|---|---|---|
| D-R1 | The entry is **Reanimator**, submitted in **Frankenstein**; Poltergeist is its red-team engine ("Death") | Accepted |
| D-R2 | Fresh code only. Nothing is copied from the earlier Reanimator prototype or from `poltergeist-old` | Accepted |
| D-R3 | The art is the earlier prototype's **dot-matrix / glyph dither** style, rebuilt from the technique, with all-new assets | Accepted |
| D-R4 | Poltergeist is **headless** inside Reanimator. Reanimator draws all the UI; Poltergeist is called, never re-implemented | Accepted |
| D-R5 | Each Poltergeist persona = one class of adversarial test ("Death's minion"), using the engine's existing safe mechanisms | Accepted |
| D-R6 | v1 revives **one prepared demo repo** with real vitals; arbitrary GitHub URLs are a stretch goal (R9) | Accepted |
| D-R7 | The revived app is served on **localhost**, so Poltergeist (localhost-only by design) can attack it | Accepted |
| D-R8 | Reanimator supplies Poltergeist a **spec of the revived app** (the "chart"); hand-written for the demo repo in v1 | Accepted |
| D-R9 | Stack: Vite + React + TypeScript + Canvas, with a small Node backend to run revive/attack. Pin versions | Proposed |
| D-R10 | Humans open PRs. Reanimator produces a branch/patch/PR text; it never opens PRs on third-party repos | Accepted |
| D-R11 | Nothing is faked for the camera: a pulse = real vitals, a wound = a real finding, a heal = a real fix + re-run | Accepted |

---

### D-R1: Reanimator / Frankenstein, with Poltergeist as the engine
- **Context:** the team had two ideas (Reanimator = revive dead repos; Poltergeist = adversarially test an app from its spec). The original Reanimator was started before the hackathon and can't be submitted; this repo (Poltergeist's, started at kickoff) is eligible. So the merged product is built here.
- **Decision:** one entry, **Reanimator**, in **Frankenstein** (a mash-up of two systems). Poltergeist becomes the red-team phase ("Death attacks the revived repo"). Costume is a secondary angle given the art.
- **Consequences:** the repo now holds two sibling projects, `poltergeist/` (engine) and `reanimator/` (app + art + story). See the repo-root `AGENTS.md`.

### D-R2: Fresh code only
- **Context:** both the earlier Reanimator prototype (`../../reanimator`) and `../../poltergeist-old` were started before the hacking window, so their code is ineligible.
- **Decision:** write all Reanimator code fresh, inside the window. Do **not** copy or port files, assets, images, models or sound from either. The *concepts, story and technique* are the team's own and carry over through these docs.
- **Consequences:** the art is rebuilt from the description in THEME.md, not lifted. Assets are made new (see AGENTS.md § the art).

### D-R3: The dot-matrix art style, rebuilt
- **Decision:** adopt the earlier prototype's look — everything drawn as Bayer-dithered dots/glyphs on black, only magic glowing — as *the* look of the entry. Rebuild the renderer from THEME §3.
- **Why:** the team wants this style 100%, and it's distinctive and on-theme.
- **Consequences:** THEME.md is binding. New risks: KI-R2 (art quality without the original author), KI-R3 (render performance).

### D-R4: Poltergeist is headless here
- **Decision:** in the merged product, Poltergeist has no UI of its own. Reanimator renders everything (including Death's attack, which visualises a Poltergeist run). Reanimator calls Poltergeist via its CLI or MCP and reads its report.
- **Consequences:** Poltergeist's own Séance UI and "haunted terminal" costume are **dropped from the entry** (recorded on the Poltergeist side too). One look only: the necromancer style.

### D-R5: Personas are classes of adversarial test
- **Context:** the team wants each persona to represent one kind of red-team attack (e.g. input-injection-style testing).
- **Decision:** keep the six personas (Wraith, Banshee, Doppelgänger, Lich, Revenant, Changeling) as Death's minions, each a class of adversarial/robustness test against the revived app **you own**:
  - Banshee → malformed/injection-style inputs from the engine's **vetted static list** (the model never writes payloads — Poltergeist D-04);
  - Wraith → impatient double-submit/navigation;
  - Doppelgänger → concurrency/race;
  - Lich → slow/constrained device;
  - Revenant → stale session/auth;
  - Changeling → keyboard-only reachability.
- **Boundary:** this is QA/robustness/defensive testing of the app the user just revived and controls, run on localhost. It is **not** an exploit generator or a tool pointed at anyone else's systems (Poltergeist D-08, F25 stays scrapped).
- **Why it's safe and honest:** findings are real flaws in the user's own code, found with known probe inputs; fixing them hardens the revived project. That's the whole story (STORY § The reckoning / The healing).

### D-R6: v1 revives one prepared repo
- **Decision:** ship with one small, permissively licensed demo repo that genuinely fails on Node 22 and is quick to revive. Keep its before/after so the demo is reliable. Arbitrary URLs are R9 (Low).
- **Why:** a vibe-coded build can't take on the full clone-anything revive engine in the time. A reliable, real single-repo demo beats a flaky general one.

### D-R7: The revived app runs on localhost
- **Decision:** the revive serves the app at a localhost origin. This is also what lets Poltergeist attack it (Poltergeist refuses non-loopback targets by design — its D-05).

### D-R8: Reanimator gives Poltergeist a chart (spec)
- **Decision:** Poltergeist tests against a spec. Reanimator provides one describing the revived app (the "chart", borrowing the original Reanimator's idea). For v1 it's hand-written for the demo repo; later an agent can write it.

### D-R9: Stack (proposed)
- **Proposal:** Vite + React + TypeScript for the app, Canvas 2D for the renderer, and a small Node backend (Express or Hono) to run revive and attack commands and stream status. Pin versions. Confirm once scaffolding (R0).

### D-R10: Humans open PRs
- Inherited from the original Reanimator. Reanimator outputs a branch, a patch and a PR description. A person decides whether to send it. No unsolicited PRs on third-party repos.

### D-R11: Nothing faked for the camera
- Inherited and central to the story's integrity (STORY § Tone). A pulse means vitals passed, a wound means a finding reproduced, a heal means a real fix plus a real re-run passing.
