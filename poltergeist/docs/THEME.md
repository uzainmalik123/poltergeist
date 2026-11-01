# Poltergeist: Theme ("the costume")

> Status: **first draft, 2026-10-31.** Expect it to change. The sprites and wordmark below are starting points to iterate on. Requirement 12 (F26) makes this binding; D-23 (Costume Contest) and D-24 (haunted terminal) are the decisions behind it.

## 1. The idea: a haunted terminal

Poltergeist looks like **an old terminal that something has got into**. Everything visual is drawn in **characters**: the app under test, the ghosts, the wordmark and the transitions. Only one thing glows, and that's the ghosts.

The same rules hold in every place Poltergeist shows up: the CLI, `haunting-report.md`, the Séance Room, the replay site and the video. A judge should recognise a Poltergeist screen from one frame.

### Borrowed from Reanimator, and what's different

The neighbouring Reanimator project (`../../../reanimator/prototypes/opening/`) has a strong look. We borrow its *method* and keep our *costume* distinct, so the two entries never look alike.

| | Reanimator | Poltergeist |
|---|---|---|
| Unit | Dots (dot-matrix) | **Characters** (ASCII glyphs) |
| Technique | 4×4 Bayer ordered dither on images | **Same Bayer dither**, but each cell picks a glyph from a ramp instead of a dot size |
| Story | Necromancer, first person, cinematic scenes | **Haunted terminal**: the tool itself is possessed, with no characters or cutscenes |
| "Only X glows" | Purple is for magic only | **Ectoplasm green is for ghosts only** |
| Real text | Stays real text up close | **Same rule**: criteria, steps and numbers are always real, selectable text |
| Font | IBM Plex Mono | **JetBrains Mono** (better box-drawing glyphs) |

## 2. Palette

All colours are CSS tokens in `@poltergeist/costume` (`palette.ts` + `palette.css`). The Séance Room is **dark only**, because a haunted terminal has no light mode. README and docs images use the same tokens.

| Token | Hex | Used for | Never used for |
|---|---|---|---|
| `--void` | `#05060a` | Background | n/a |
| `--rule` | `#1a1e27` | Borders, tile frames, separators | Text |
| `--dim` | `#69707a` | Secondary text, pending lines, the app's dark tones | Verdicts |
| `--ink` | `#d6d9cc` | Primary text, the app's light tones, **clean** verdicts | Ghosts |
| `--ecto` | `#7dffb0` | **Ghosts only**: sprites, cursors, trails, the wordmark's glow | Verdicts, buttons, the app |
| `--haunted` | `#ff3b5c` | `haunted` verdicts and possessed lines, the failing element | Anything else |
| `--flaky` | `#ffb020` | `flaky` verdicts | Anything else |
| `--unsure` | `#8b93a7` | `inconclusive` / `uncompilable` | Anything else |

- **Clean is quiet.** A clean line is just `--ink` with its glyph. Nothing to see, nothing glowing. Red is the only loud colour on the board.
- **The app is monochrome.** Frames of the target app are drawn in `--dim` → `--ink` only, so the green ghosts and red failures stand out on top.
- Contrast: `--ink` and `--dim` on `--void` must stay readable after YouTube compression. Check them in the KI-01-era test recording (KI-26).

## 3. The glyph renderer (F26)

This turns any image (a ghost's live frame, a screenshot, a picture for the video) into coloured characters, deterministically.

1. **Grid:** split the image into cells of one monospace character (default 8×16 px in the source → one glyph). Tiles in the Séance use about 96×40 cells.
2. **Luminance:** average each cell's luminance (Rec. 709), with a gamma of about 1.2 so mid-tones don't wash out.
3. **Ordered dither:** add the 4×4 Bayer threshold for the cell's position (`BAYER[(row&3)*4 + (col&3)]`, values `(v+0.5)/16`), scaled to one ramp step. This is the same matrix Reanimator uses. It gives the stable, non-flickering texture that random dither can't.
4. **Glyph ramp** (dark → light): `" .:-=+*#%@"`. Lowest step = empty cell, as Reanimator keeps its darkest parts empty.
5. **Colour:** the app is mapped to `--dim`…`--ink` by the same luminance. Overlays (ghost cursors, the failing element's box) are drawn after, in their own token colours.
6. **Determinism:** the same frame and grid always produce the same characters, so replays and recordings match live runs exactly.
7. **Escape hatch:** every ASCII frame has a **"see the real frame"** toggle (Requirement 12.5). Judges must be able to check that the evidence is real.

Performance target: 12 tiles × 4 fps of 96×40 cells on one `<canvas>` per tile, using `fillText` from a pre-rendered glyph atlas. That's about 180k glyphs/s, well within a laptop's budget (KI-25).

## 4. Wordmark and sprites (drafts)

### Wordmark (box-drawing, 3 rows)

```
 ╔═╗╔═╗╦  ╔╦╗╔═╗╦═╗╔═╗╔═╗╦╔═╗╔╦╗
 ╠═╝║ ║║   ║ ║╣ ╠╦╝║ ╦║╣ ║╚═╗ ║
 ╩  ╚═╝╩═╝ ╩ ╚═╝╩╚═╚═╝╚═╝╩╚═╝ ╩
        your spec, haunted.
```

In the Séance and the video, the wordmark is drawn in `--ink` with an `--ecto` glow that flickers once on load. In the CLI it's plain text (no colour when `NO_COLOR` is set or output isn't a TTY).

### Ghost sprites (5 wide × 4 tall, one per persona)

```
 Wraith     Banshee    Doppelgänger    Lich       Revenant   Changeling
  .-.        .-.        .-.  .-.      _.-._        .-.         .-.
 (>.<)      (O O)      (o o)(o o)    (x . x)      (- -)       (? ?)
 /| |\      |\O/|      | ~ || ~ |     |___|       |   |>      |[_]|
 ^^^^^      ^^^^^      ^^^^  ^^^^     ^^^^^       ^^^^^       ^^^^^
```

- The faces carry each persona's behaviour: the Wraith is impatient, the Banshee screams, the Doppelgänger is a pair, the Lich is ancient, the Revenant is half asleep, and the Changeling uses keys.
- In the Séance, a ghost's sprite rides its cursor position on the ASCII frame, in `--ecto`, with a 3-frame trail that fades from `--ecto` to `--dim`.
- **These are drafts.** Iterating on them is the first F26 task.

### Verdict glyphs (pure ASCII, so they work in markdown and terminals)

| Verdict | Glyph | Colour |
|---|---|---|
| pending | `[  ]` | `--dim` |
| running | `[..]` (animated `[. ]` → `[..]` → `[ .]`) | `--ink` |
| clean | `[ok]` | `--ink` |
| flaky | `[~~]` | `--flaky` |
| haunted | `[!!]` | `--haunted` |
| inconclusive | `[??]` | `--unsure` |
| not applicable | `[--]` | `--dim` |

## 5. Surfaces

### CLI (F09)
- The wordmark plus a one-line summary on `summon` start.
- One live line per ghost: `sprite-initial  persona  criterion  step` (for example `W  wraith  3.2  dblclick "Claim Sour Skulls"`).
- The final board uses the verdict glyphs. Exit codes are unchanged.
- `NO_COLOR` and non-TTY output mean no colour and no animation (CI stays clean).

### `haunting-report.md` (F08)
- It opens with the wordmark in a ```` ```text ```` block and the counts. Markdown has no colour, so the glyphs carry the meaning.
- One section per haunted or flaky criterion, headed `[!!] 3.2 — <criterion text>`.
- The report must stay useful to an agent: the theme is a header and glyphs, never prose that hides the facts.

### Séance Room (F12, F26, F22)
- **Layout:** the requirement board on the left (real text, verdict glyphs) and a grid of ghost tiles on the right (ASCII frames with sprites on them).
- **Possession (haunted):** the criterion line glitches for about 600 ms (glyphs swap to `▓▒░` noise and back), then settles in `--haunted` with `[!!]`. The failing element on the tile gets a red box, drawn in box characters.
- **Exorcism (re-haunt clean):** the red line dissolves glyph by glyph back to `--ink`, `[!!]` becomes `[ok]`, and the ghost sprite fades upward and leaves its tile.
- **Idle:** a faint scanline drift and a rare flicker on the wordmark. Nothing else moves when no ghost is acting.

### The video
- The hero shot is the swarm: 12 tiles of ASCII app with green ghosts all over them, and one requirement line turning red.
- Record at 1080p with glyph cells of at least 8×16 px on screen (KI-26).

## 6. Motion and accessibility

- `prefers-reduced-motion`: no flicker, no drift, no glitch. Possession and exorcism become instant colour changes.
- Every ASCII image has a text alternative (`aria-label`), and the "real frame" toggle is keyboard reachable.
- Sound (F22) is off by default.

## 7. Don'ts

- Don't use `--ecto` for anything that isn't a ghost (not links, not buttons, not "success").
- Don't turn real text into glyph art. Criteria, steps, numbers and code stay as text.
- Don't add a light theme, gradients, rounded "SaaS" cards or emoji. They break the costume.
- Don't copy Reanimator's assets, dot style, purple or necromancer story (it's a separate entry).
- Don't let theme words into LLM prompts (D-09).
