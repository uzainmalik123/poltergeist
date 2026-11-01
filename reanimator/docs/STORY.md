# Reanimator: The Story

> The narrative the whole product is dressed in. The UI, the copy, the sounds and the art all serve this. Keep it consistent everywhere. The look that tells this story is in [THEME.md](THEME.md); what we actually build is in [PRD.md](PRD.md).

## One line

**You are a necromancer who raises dead code from the grave. Death wants it to stay dead, so he comes to break what you revived. You read what he broke, and you heal it.**

## The world

Across the internet is a graveyard of **dead repositories**: open-source projects that once worked and now won't install, build or run on a modern machine. They're abandoned, their dependencies rotted, their build tools long gone. To everyone else they're headstones. To a necromancer, they're bodies waiting to be raised.

You practise a forbidden craft: **reanimation**. With the right ritual you pull a dead project back across to the living, running on today's tools, still itself, breathing again.

You are not alone. **Kiro is your familiar** — a small spirit that does your bidding: it walks the graveyard to find the dead, performs the surgery you direct, and writes in your grimoire. You speak; Kiro acts.

## The antagonist: Death

**Death resents you.** Every repo you raise is one he thinks he had claimed. He is old, patient and spiteful, and he will not let a revival stand.

So when you raise a project, **Death comes for it.** He doesn't fight you directly. He goes after the thing you just made: he grabs the revived app and tries to **break it** — hammering its forms, racing its actions, feeding it rot, shaking it until something cracks. Death is a tester with a grudge. Whatever he can break, he will.

Death does not create the weakness. He *finds* it. Every crack he exposes was already in the code. He just has no mercy about looking.

> **This is the red-team.** Death's attack is the [Poltergeist](../../poltergeist/README.md) engine, aimed at the repo you own, the one you just revived. Each of Death's shapes is one kind of adversarial test. He never attacks anything but the project on your table.

## Death's minions

Death doesn't come alone. He sends shapes, each with its own way of ruining things. They are the Poltergeist **personas**, re-cast as Death's servants:

- **The Wraith** — never waits. Clicks twice, submits before the page is ready, goes back mid-action. Finds duplicates and half-finished work.
- **The Banshee** — screams garbage into every field: junk text, endless strings, things that look like commands. Finds inputs that were never guarded.
- **The Doppelgänger** — two of you at once, racing for the same thing. Finds what breaks when two hands grab it together.
- **The Lich** — ancient and slow, on a frozen old machine. Finds what only breaks when the world is slow and small.
- **The Revenant** — comes back long after he should be gone, with a dead key still in the lock. Finds what trusts a session that already ended.
- **The Changeling** — refuses the mouse, moves only by key. Finds what a hand on the keyboard alone can never reach.

## The loop (one revival)

1. **The graveyard.** Kiro walks out and brings back the dead: a repo that no longer runs.
2. **The ritual.** You raise it. The ritual lights, the heart monitor climbs from flatline to a pulse, and the project runs again — on modern tools, still itself.
3. **Death arrives.** The light dims. Death and his minions fall on the revived project and try to break it.
4. **The reckoning.** The dust clears. You get Death's tally: what he broke, how, and where. Each wound is a real flaw in the code.
5. **The healing.** You direct Kiro to mend each wound. Then you raise your hand again and dare Death to try once more. The wounds close one by one.
6. **At peace.** The project stands, revived *and* hardened: it survived Death. You send it back to the living (a branch, a patch, a pull request a human can choose to open).

## The arc of the demo (≈3 minutes)

- **Cold open:** a headstone in the graveyard. "This project died in 2016." Flatline.
- **The raise:** the ritual; flatline → pulse; the old app loads and works.
- **The turn:** Death appears. His minions swarm the running app in the necromancer's dot-matrix style.
- **The break:** one real flaw cracks open — a form that takes anything, a race that double-spends. A wound opens on the body.
- **The heal:** you send Kiro to fix it; the wound closes; you re-summon Death; he can't break it this time.
- **Close:** the project stands, marked "revived — and it survived Death."

## Tone

Spooky in the framing, serious in the engineering (inherited from the original Reanimator's rule). The theatre is real theatre: a graveyard, a ritual, a reaper, wounds that close. But every pulse, every wound and every healing is backed by a real check on real code. **Nothing is faked for the camera** — Death only ever breaks what was genuinely breakable, and a wound only closes when the code is genuinely fixed.

## What is true vs dressed

| In the story | What it really is |
|---|---|
| Necromancer (you) | The developer driving the app |
| Kiro, your familiar | Kiro, the agentic IDE, doing the search / surgery / fixes |
| The graveyard | Dead GitHub repos (a curated set in v1) |
| The ritual / the raise | Reviving the repo on a modern toolchain, proven by deterministic vitals |
| The pulse / heart monitor | Install / build / serve / render checks passing |
| Death and his minions | The Poltergeist red-team engine and its personas |
| Death's attack | Adversarial tests run against the revived app you own |
| A wound | A real, reproduced flaw (a finding in the report) |
| The healing | Kiro fixing the finding; the re-run passing |
| Sending it to the living | A branch + patch + PR description for a human to open |
