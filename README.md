# @mengtaoxin/evolving

Project-agnostic change-finish **stages** and serial **prepare** / **verify** runner.

Put an `evolving.yml` (`version: 2`) at the repo root. The CLI loads that file and `spawn`s the commands you declare. Formatters, linters, and test runners stay in the consumer repo.

Designed for **agents first**: progressive `explain` is the **sole protocol source** (downstream AGENTS.md should only point at it), quiet JSON stdout by default, a fixed `contract`, `.evolving/last-run.json` for resume, and `.evolving/logs/` for full step output.

## Install

```bash
npm install -D @mengtaoxin/evolving
```

## Downstream agent entry

In the consumer repo’s `AGENTS.md` (or Cursor rules), only point at explain — do **not** restate prepare/verify/IO rules:

```markdown
Update this project by following `evolving explain` (start with `npx evolving explain`).
```

Copy [templates/AGENTS.evolving.md](templates/AGENTS.evolving.md) if useful.

## Commands

| Command | Behavior |
| --- | --- |
| `evolving explain [topic]` | **Agent entry**: map + next first step, or one machine topic drilled |
| `evolving stages` | Minimal id+kind timeline (+ first) — not a full detail dump |
| `evolving prepare` | Run `kind: prepare` commands only (may write the tree: format / lint:fix) |
| `evolving verify` | Run `verify.commands` in order: always-on + git path select + `command://` (read-only) |
| `evolving finish` | Run every non-guidance stage in order (prepare → verify → `kind: run`) |
| `evolving status` | Read `.evolving/last-run.json` and suggest `next` |
| `evolving agent-contract` | Alias of `explain contract` |

Flags: `--config <path>`, `status --full` (embed full last-run), `verify --e2e` (accepted no-op for older habits). stdout is always one JSON object.

**Order:** after editing code, follow `after_edit` in `evolving.yml` (typically `prepare` then `verify`). Do not hand-edit whitespace when a prepare stage exists — run `evolving prepare`. `verify` never mutates the tree.

## Agent usage

Progressive discovery — map + first step only; **no CLI panorama** (neither `explain` nor `stages` dumps every stage body/command):

```bash
evolving explain                 # map (stage_ids) + next; topics index
evolving explain prepare         # machine topic detail when needed
evolving explain verify
evolving prepare                 # then act
evolving verify
# on failure:
evolving status
```

Topics: `contract`, `prepare`, `verify`, `finish`, `stages`, `status`, `json`, `guidance`.

- Guidance stages (`kind: guidance`, `skip_when`) are **agent-evaluated**; the CLI never executes them. Read `evolving.yml` for the **current** guidance step only.
- `evolving stages` / `explain stages` are a minimal `{id,kind}` map (+ first), not a full timeline dump.
- `finish` runs all non-guidance stages. Put extras as `kind: run` (e.g. codegen).
- Recommended `skip_when` tokens: `entry_file_known`, `docs_only`, `no_behavior_change`, `already_verified` (free text still allowed).

## Config sketch

```yaml
version: 2

after_edit: [prepare, verify]

stages:
  - id: orient
    kind: guidance
    summary: Locate entry files for this repo
    skip_when: entry_file_known
  - id: prepare
    kind: prepare
    commands:
      - name: format
        command: ["npm", "run", "format"]
      - name: lint:fix
        command: ["npm", "run", "lint:fix"]
  - id: verify
    kind: verify
    commands:
      - name: format:check
        command: ["npm", "run", "format:check"]
      - name: lint
        command: ["npm", "run", "lint"]
      # optional host binary: missing → warn; findings → fail
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
    kind: guidance
    summary: Update owning docs if a contract changed
```

- `commands` items share the same shape: `name` + `command` (optional `id`, defaults to `name`).
- Omit `run_in_file_change` to always run on verify; set it for git path selection.
- `command://id` expands to other verify commands (composition). Do not mix refs with real argv tokens.
- JSON Schema: [schema/evolving.schema.json](schema/evolving.schema.json).

- `kind: prepare` — write-allowed; optional (omit the stage → empty prepare).
- `onMissing: warn` on a gate command — if the executable is not on PATH (`spawn` ENOENT), print a warn and continue; real non-zero exits from an installed tool still fail.
- `.evolving/last-run.json` — written after prepare/verify/finish; safe to gitignore in consumer repos.
- `.evolving/logs/` — full per-step stdout/stderr; every `step.log` points here.

## Design notes

- Prepare writes; verify asserts. Keep that split so local gates stay trustworthy and CI can mirror read-only checks.
- CI belongs in each repo’s GitHub Actions (or other) workflow — this package does not define `evolving ci`.
- `skip_when` on guidance stages is documentation for agents; the CLI does not evaluate it.
- evolving is a deterministic gate runner + progressive checklist, not an agent runtime (no LangGraph).
- Agent protocol lives only in `evolving explain` / contract + this repo’s `evolving.yml` — not in a second consumer handbook.
