# Reanimator: The Art ("the costume")

> This is the single most important doc for the look. The whole entry competes partly on this. It teaches the **dot-matrix / glyph art style** well enough that an agent can build it **from scratch**, to roughly the quality of the earlier prototype — which we are **not allowed to copy** (D-R2, D-R3). Read this before writing any rendering code. The story it serves is in [STORY.md](STORY.md).

## 1. The idea in one line

**Everything you see is drawn as a grid of dots (or glyphs), dithered from a source image, on a dark screen, and only magic glows.** It should feel hand-made, occult and a little broken — a necromancer's vision, not a clean web app.

## 2. Why this style (and the rule we must not break)

The style comes from the earlier Reanimator prototype and we want it 100%. But that prototype was built before the hackathon, so **none of its code, images, 3D models or sound may be used** (D-R2). We rebuild the *technique* from this description and make **our own** assets inside the hacking window.

The technique is generic and well known (ordered dithering), so describing and re-implementing it is fine. What we must not do is copy their files. See [AGENTS.md](../AGENTS.md) § "The art, step by step" for how to produce assets legally and fast.

## 3. The dot-matrix renderer (the heart of the look)

This is the one piece of real engineering behind the art. Build it once, use it for every scene. It turns any source image into a grid of dots on a `<canvas>`.

**Inputs:** a source image (or a frame), and a `pitch` (how many screen pixels per dot).

**Algorithm (deterministic):**
1. **Grid.** Divide the canvas into square cells of `pitch` pixels. Each cell becomes one dot. Leave a 1–2px `gap` between cells so the grid reads as dots, not a photo.
2. **Luminance.** For each cell, sample the source image's average brightness (Rec. 709: `0.2126*R + 0.7152*G + 0.0722*B`). Optionally apply a gamma (~1.2) so mid-tones don't wash out.
3. **Ordered (Bayer) dither.** Add a threshold from the 4×4 Bayer matrix based on the cell's position, so the texture is stable and never flickers:
   ```
   BAYER4 = [ 0, 8, 2,10,
             12, 4,14, 6,
              3,11, 1, 9,
             15, 7,13, 5 ]   // use (v + 0.5) / 16 as the threshold
   threshold = BAYER4[(row & 3) * 4 + (col & 3)]
   ```
4. **Quantise to a few brightness steps** (e.g. 4 steps). The darkest step draws **nothing** (empty cell) — darkness is the absence of dots, like the prototype.
5. **Draw.** Fill each lit cell with a dot: a filled circle (`arc`) or a filled square, sized by its brightness step. For the glyph variant, draw a character from a ramp instead (see §7).
6. **Determinism.** The same image + pitch always produces the same dots. This matters for recording and for tests.

**Performance:** at small `pitch` there are a lot of dots. Compute luminance on a downscaled copy of the image (one read of a small `drawImage`), cache the per-cell values, and only redraw cells that changed between frames. Target 30fps for animated scenes. If it stalls, raise `pitch` (bigger dots, fewer of them).

**Responsiveness:** pick `pitch` from the viewport (e.g. 2px on phones, 2.2–3px on desktop) so dot density feels right on any screen.

## 4. Palette — and the one rule that makes it read

Colours are CSS tokens. Dark background always. **The whole look hangs on "only certain things glow."**

| Token | Hex | For | Never for |
|---|---|---|---|
| `--void` | `#06060a` | Background | anything else |
| `--bone` | `#cfc8b8` | Dead things in their own colour: the repo, the body, old paper, bone | glows |
| `--dim` | `#5d6470` | Shadow, secondary dots, inactive text | glows / verdicts |
| `--magic` | `#b98cff` | **Your necromancy only**: the ritual, the spell circle, the cast, Kiro the familiar, the pulse when it beats | Death, errors, the app's own colour |
| `--death` | `#ff3b4e` | **Death and his wounds only**: Death, his minions, what he breaks, a flatline | your magic, normal UI |
| `--rot` | `#8fb26b` | Sickly green accents on the dead/decayed and on Death's "rot" attacks (optional) | your magic |

- **Purple is sacred to you, red belongs to Death.** Never mix them. If the user's magic is on screen it's purple; if Death is on screen it's red. This single contrast is the whole story told in colour.
- The dead repo and body are drawn in `--bone`/`--dim` (no glow) so that when your purple magic or Death's red touches them, it pops.
- Inherited from the prototype: **"dark, not cute"** and **"lit by what glows."** The room is black; only magic and Death give light.

## 5. The scenes

The experience is a sequence of full-screen dot-matrix scenes. Scene changes are **your eyes closing and opening** (fade to black and back). Build them in this order of importance:

1. **The graveyard** (`--bone` headstones on `--void`, fog). Kiro (a small `--magic` spirit) walks out and returns dragging a body: the dead repo. A headstone reads the repo name and "died 2016".
2. **The ritual / the raise.** A **spell circle** (`--magic`) on the ground; it spins and brightens as the raise runs. A **heart monitor** line climbs from **flatline** (`--death` flat line) to a **pulse** (`--magic` beating) as vitals pass. This is the money shot of the revive.
3. **Death arrives.** The screen dims, `--death` bleeds in from the edges, and **Death** (a reaper, dot-matrix) rises over the revived body. His **minions** (the six personas, §6) swarm the running app.
4. **The grimoire** (the work surface). See §8 — this is where the chat / agent / report lives, and where you heal wounds.

> You don't need all four polished for the demo. Prioritise **the raise** (scene 2) and **Death's attack** (scene 3): those carry the story and the mashup. The graveyard and grimoire can be lighter.

## 6. Death and his minions (the Poltergeist personas, in costume)

Death is one big dot-matrix reaper in `--death`. His six minions are the Poltergeist personas, each a small dot-matrix sprite in `--death`, swarming the app during the attack. These are **drafts** — iterate with the user:

```
 Wraith     Banshee    Doppelgänger   Lich        Revenant    Changeling
  .-.         .-.         .-. .-.      _.-._        .-.          .-.
 (>‿<)       (O□O)       (o o)(o o)   (x_x)        (- -)        (⌐ ⌐)
 /|×|\       \|!|/       |~| |~|       |▓▓|         |..|>        |[]|
  ^ ^         ^^^         ^^   ^^       ^^^^         ^^^^         ^^^^
```

- Each minion rides over the live (dot-matrix-rendered) app where it's attacking, in `--death`, with a short fading trail.
- When a minion breaks something, a **wound** opens on the body/app: a red gash drawn in box/▓▒░ glyphs at that spot, labelled with the finding.
- When you heal it, the wound **closes** (dissolves glyph by glyph) and, if all wounds on a part are closed, a faint `--magic` glow seals it.

## 7. Glyph (ASCII) variant

For the terminal-ish surfaces (the grimoire text, the report, any CLI), use the same dither but pick a **character** per cell from a ramp instead of a dot:

```
ramp (dark → light):  " .:-=+*#%@"
```
Lowest step = space (empty), same "darkness is empty" rule. Use a monospace font with good coverage (JetBrains Mono). This keeps the dotted scenes and the texty surfaces part of one family.

## 8. The grimoire = the agent/chat/report

Borrowed concept from the prototype (re-implemented fresh): **the grimoire is how the agent talks to you.** It reads as a spellbook, not a chat window.

| Normally | In the grimoire |
|---|---|
| Your prompt | A **spell**: an ink line marked with a dagger, cast with Enter |
| The agent's reply | **Quill writing**, a letter at a time |
| Tools it ran ("read 6 files") | **Margin notes** in a smaller hand |
| A code change | A **ruled box** with the − and + lines |
| A finished fix / PR | A **wax seal** |
| Death's findings (the report) | **Wounds listed on the body's chart**, each as a line to heal |
| Context left | A **candle** burning down |

- **Readability rule (important):** the writing on the grimoire is **real, selectable text**, not dots. Up close the page stops being dots and becomes smooth paper so the text is crisp at any resolution. The same rule as Poltergeist: *imagery is dithered, text stays text.*

## 9. Motion and accessibility

- `prefers-reduced-motion`: no flicker, no spin, no drift. The circle, the pulse and the wounds change state instantly instead of animating.
- Every dot-matrix scene has a text alternative (`aria-label`) describing what it shows.
- The grimoire text is real text, so it's screen-reader and zoom friendly.
- Sound (heartbeat, the cast, Death) is **off by default**, with a toggle.

## 10. Staying distinct from the earlier prototype (and from Poltergeist standalone)

- We share the *technique* (Bayer dither, dots) with the earlier Reanimator — that's intended, it's our team's style — but **all assets are new** (D-R2). Don't reproduce their exact scenes shot-for-shot; make our own compositions.
- Poltergeist on its own had a "haunted terminal" green-ghost look. **In the merged product that is dropped**: the one look is this necromancer dot-matrix style. Poltergeist is headless here (it has no UI of its own — Reanimator draws everything). Green ectoplasm is **not** used; Death's things are red (`--death`).

## 11. Don'ts

- Don't mix `--magic` (yours) and `--death` (his) on the same element.
- Don't turn real text into dots/glyphs (criteria, findings, code, numbers stay text).
- Don't use the earlier prototype's images, models or sound.
- Don't add a light theme, flat SaaS cards, emoji UI, or gradients that aren't dithered.
- Don't let the theatre hide the truth: a pulse means vitals really passed, a wound means a real finding, a healed wound means a real fix (see STORY § Tone).
