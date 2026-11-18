# @mengtaoxin/evolving

Project-agnostic **ordered stages** checklist and machine-stage runner.

Put an `evolving.yml` (`version: 1`) at the repo root. The CLI loads that file and `spawn`s the commands you declare on machine stages. Formatters, linters, and test runners stay in the consumer repo.

Designed for **agents first**: progressive `explain` is the **sole protocol source** (downstream AGENTS.md should only point at it), quiet JSON stdout by default, a fixed `contract`, `.evolving/last-run.json` for resume, and `.evolving/logs/` for full step output.

## Install

```bash
npm install -D @mengtaoxin/evolving
```

## Downstream agent entry

In the consumer repo’s `AGENTS.md` (or Cursor rules), only point at explain — do **not** restate stage/run/IO rules:

```markdown
Update this project by following `npx evolving explain` (do not add a pipe).
```

Copy [templates/AGENTS.evolving.md](templates/AGENTS.evolving.md) if useful.

## Commands

| Command | Behavior |
| --- | --- |
| `evolving explain [topic]` | **Agent entry**: map + next action. A stage id returns that step's summary, refs, and skip_when only |
| `evolving stages` | Minimal id+runnable timeline (+ first) — not a full detail dump |
| `evolving run <stage-id> [command-id\|all...]` | Run one stage’s commands (git path select + `command://`) |
| `evolving run --tags tag1,tag2` | Run machine stages with any listed tag (document order) |
| `evolving run --ids id1,id2` | Run listed stage ids in order (skips agent stages) |
| `evolving status` | Read `.evolving/last-run.json` and suggest `next` |

Flags: `--config <path>`, `status --full` (embed full last-run). stdout is always one JSON object.

**Order:** `stages` document order is the only protocol axis. Walk top-down. On failure, `status` suggests the nearest prior agent stage (typically `edit`), then re-walk.

## Agent usage

Progressive discovery — map + next action; **no CLI panorama**:

```bash
evolving explain                 # map (stage_ids) + next action
evolving explain run             # machine commands, only before evolving run
evolving run prepare             # then act
evolving run verify
# or batch by consumer-chosen tags / ids:
evolving run --tags gate
evolving run --ids prepare,verify
# on failure:
evolving status
```

Topics: `contract`, `run`, `stages`, `status`, `json`, `agent`. `evolving explain <stage-id>` returns that step's summary, refs, and skip_when only.

- Agent stages (no `commands`) are **agent-evaluated**; the CLI never executes them. Read `evolving.yml` for the **current** agent step only.
- Place an **edit** agent stage where the agent should change code (e.g. after orient, before gates). Attach TDD docs via `refs`.
- `evolving stages` / `explain stages` are a minimal `{id,runnable}` map (+ first), not a full timeline dump.
- There is **no** fixed finish/wrap-up command — downstream chooses how to batch gates (`--tags` and/or `--ids`).
- Recommended `skip_when` tokens: `entry_file_known`, `docs_only`, `no_behavior_change`, `already_verified` (free text still allowed).
- Optional `tags` on any stage: `needs-agent` is a semantic hint; other tags are free text for `evolving run --tags`. Progressive maps stay `{id,runnable}`; Read `evolving.yml` for the current step to see tags.

## Config sketch

```yaml
version: 1

stages:
  - id: orient
    summary: Locate entry files for this repo
    skip_when: entry_file_known
  - id: edit
    summary: Change code following TDD
    refs: ["docs/tdd.md"]
    tags: [needs-agent]
  - id: prepare
    tags: [gate]
    commands:
      - name: format
        command: ["npm", "run", "format"]
      - name: lint:fix
        command: ["npm", "run", "lint:fix"]
  - id: verify
    tags: [gate]
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
- `.evolving/last-run.json` — written after run; safe to gitignore in consumer repos.
- `.evolving/logs/` — full per-step stdout/stderr; every `step.log` points here.

## Design notes

- Document order is the checklist; agents may jump back (especially to the edit stage after a failed gate).
- evolving does not enforce write vs read-only — downstream chooses what each command does.
- CI belongs in each repo’s GitHub Actions (or other) workflow — this package does not define `evolving ci`.
- `skip_when` on agent stages is documentation for agents; the CLI does not evaluate it.
- `tags` are optional (recommended: `needs-agent`). Other tags are consumer-defined; use `evolving run --tags` to filter. Tags are not in the stages map.
- evolving is a deterministic gate runner + progressive checklist, not an agent runtime (no LangGraph).
- Agent protocol lives only in `evolving explain` / contract + this repo’s `evolving.yml` — not in a second consumer handbook.
