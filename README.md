```text
 ╔═╗╔═╗╦  ╔╦╗╔═╗╦═╗╔═╗╔═╗╦╔═╗╔╦╗
 ╠═╝║ ║║   ║ ║╣ ╠╦╝║ ╦║╣ ║╚═╗ ║
 ╩  ╚═╝╩═╝ ╩ ╚═╝╩╚═╚═╝╚═╝╩╚═╝ ╩
        your spec, haunted.
```

Poltergeist reads a Kiro spec (`.kiro/specs/<name>/requirements.md`) and turns each acceptance criterion into deterministic browser tests. Each test is run by a "ghost" persona:

- an impatient double-clicker
- a chaos typist
- a twin racing you in another tab

Poltergeist then writes a `haunting-report.md` next to the spec, so Kiro's agent can fix whatever is *haunted* and re-check it.

Built for **Kiroween 2026** (Costume Contest).

**Status:** early. Docs only so far; the code is being built inside the hacking window.

## Docs

| Doc | What |
|---|---|
| [.kiro/specs/poltergeist/](.kiro/specs/poltergeist/requirements.md) | The spec: requirements, design and tasks, in Kiro's format |
| [docs/PRD.md](docs/PRD.md) | Features, build order, priorities and status. **Start here** |
| [docs/THEME.md](docs/THEME.md) | The costume: a haunted terminal in ASCII |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Decisions made, and why |
| [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md) | Open risks |
| [docs/LESSONS.md](docs/LESSONS.md) | What an earlier throwaway prototype taught us |
| [docs/STACK.md](docs/STACK.md) | Technology, SaaS and AWS |

## Licence

MIT
