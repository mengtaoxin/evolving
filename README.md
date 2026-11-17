# @mengtaoxin/evolving

Project-agnostic **ordered stages** checklist and machine-stage runner.

Put an `evolving.yml` (`version: 2`) at the repo root. The CLI loads that file and `spawn`s the commands you declare on machine stages. Formatters, linters, and test runners stay in the consumer repo.

Designed for **agents first**: progressive `explain` is the **sole protocol source** (downstream AGENTS.md should only point at it), quiet JSON stdout by default, a fixed `contract`, `.evolving/last-run.json` for resume, and `.evolving/logs/` for full step output.

## Install

```bash
npm install -D @mengtaoxin/evolving
```

## Downstream agent entry

In the consumer repo’s `AGENTS.md` (or Cursor rules), only point at explain — do **not** restate stage/run/IO rules:

```markdown
Update this project by following `evolving explain` (start with `npx evolving explain`).
```

Copy [templates/AGENTS.evolving.md](templates/AGENTS.evolving.md) if useful.

## Commands

| Command | Behavior |
| --- | --- |
| `evolving explain [topic]` | **Agent entry**: map + next first step, or one machine topic drilled |
| `evolving stages` | Minimal id+runnable timeline (+ first) — not a full detail dump |
| `evolving run <stage-id> [command-id\|all...]` | Run one stage’s commands (git path select + `command://`) |
| `evolving finish` | Run every machine stage in document order (skip agent stages) |
| `evolving status` | Read `.evolving/last-run.json` and suggest `next` |
| `evolving agent-contract` | Alias of `explain contract` |

Flags: `--config <path>`, `status --full` (embed full last-run). stdout is always one JSON object.

**Order:** `stages` document order is the only protocol axis. Walk top-down. On failure, `status` suggests the nearest prior agent stage (typically `edit`), then re-walk.

## Agent usage

Progressive discovery — map + first step only; **no CLI panorama**:

```bash
evolving explain                 # map (stage_ids) + next; topics index
evolving explain run             # machine topic detail when needed
evolving run prepare             # then act
evolving run verify
# on failure:
evolving status
```

Topics: `contract`, `run`, `finish`, `stages`, `status`, `json`, `agent`.

- Agent stages (no `commands`) are **agent-evaluated**; the CLI never executes them. Read `evolving.yml` for the **current** agent step only.
- Place an **edit** agent stage where the agent should change code (e.g. after orient, before gates). Attach TDD docs via `refs`.
- `evolving stages` / `explain stages` are a minimal `{id,runnable}` map (+ first), not a full timeline dump.
- `finish` runs all machine stages. Put extras as stages with `commands`.
- Recommended `skip_when` tokens: `entry_file_known`, `docs_only`, `no_behavior_change`, `already_verified` (free text still allowed).
- Optional `tags` on any stage (e.g. `needs-agent`) are semantic hints for agents — not enforced by the CLI. Progressive maps stay `{id,runnable}`; Read `evolving.yml` for the current step to see tags.

## Config sketch

```yaml
version: 2

stages:
  - id: orient
    summary: Locate entry files for this repo
    skip_when: entry_file_known
  - id: edit
    summary: Change code following TDD
    refs: ["docs/tdd.md"]
    tags: [needs-agent]
  - id: prepare
    commands:
      - name: format
        command: ["npm", "run", "format"]
      - name: lint:fix
        command: ["npm", "run", "lint:fix"]
  - id: verify
    commands:
      - name: format:check
        command: ["npm", "run", "format:check"]
      - name: lint
        command: ["npm", "run", "lint"]
      - name: gitleaks
        command: ["gitleaks", "detect", "--source", "."]
        onMissing: warn
      - name: test:lib
        command: ["npm", "run", "test:lib"]
        run_in_file_change: ["packages/lib/"]
      - name: deps
        command: ["command://test:lib"]
        run_in_file_change: ["package.json", "package-lock.json"]
      - name: test:e2e
        command: ["npm", "run", "test:e2e"]
  - id: docs
    summary: Update owning docs if a contract changed
```

- Stages **with** `commands` are machine-runnable (`evolving run <id>`). Stages **without** are agent-only.
- `commands` items: `name` + `command` (optional `id`, defaults to `name`).
- Omit `run_in_file_change` to always run; set it for git path selection.
- `command://id` expands to other commands in the **same** stage. Do not mix refs with real argv tokens.
- JSON Schema: [schema/evolving.schema.json](schema/evolving.schema.json).

- `onMissing: warn` — if the executable is not on PATH (`spawn` ENOENT), print a warn and continue; real non-zero exits from an installed tool still fail.
- `.evolving/last-run.json` — written after run/finish; safe to gitignore in consumer repos.
- `.evolving/logs/` — full per-step stdout/stderr; every `step.log` points here.

## Design notes

- Document order is the checklist; agents may jump back (especially to the edit stage after a failed gate).
- evolving does not enforce write vs read-only — downstream chooses what each command does.
- CI belongs in each repo’s GitHub Actions (or other) workflow — this package does not define `evolving ci`.
- `skip_when` on agent stages is documentation for agents; the CLI does not evaluate it.
- `tags` are optional semantic labels (recommended: `needs-agent`); the CLI does not enforce them and does not put them in the stages map.
- evolving is a deterministic gate runner + progressive checklist, not an agent runtime (no LangGraph).
- Agent protocol lives only in `evolving explain` / contract + this repo’s `evolving.yml` — not in a second consumer handbook.
