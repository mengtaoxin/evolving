# @mengtaoxin/evolving

Project-agnostic change-finish **stages** and serial **prepare** / **check** / **verify** runner.

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
| `evolving prepare` | Run `kind: prepare` steps only (may write the tree: format / lint:fix) |
| `evolving check` | Run `verify.check` only (read-only; check ⊂ verify) |
| `evolving verify` | `check`, then suites from git detect (or explicit ids), then `always` (read-only) |
| `evolving finish` | Run every non-guidance stage in order (prepare → verify → `kind: run`) |
| `evolving status` | Read `.evolving/last-run.json` and suggest `next` |
| `evolving agent-contract` | Alias of `explain contract` |

Flags: `--config <path>`, `status --full` (embed full last-run), `verify --check` (static gates only), `verify --e2e` (accepted no-op for older habits). stdout is always one JSON object.

**Order:** after editing code, follow `after_edit` in `evolving.yml` (typically `prepare` then `verify`). Do not hand-edit whitespace when a prepare / `fix` companion exists. `check` and `verify` never mutate the tree.

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

Topics: `contract`, `prepare`, `check`, `verify`, `finish`, `stages`, `status`, `json`, `guidance`.

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
    steps:
      - name: format
        command: ["npm", "run", "format"]
      - name: lint:fix
        command: ["npm", "run", "lint:fix"]
  - id: verify
    kind: verify
    check:
      - name: format:check
        command: ["npm", "run", "format:check"]
        fix: ["npm", "run", "format"]
      - name: lint
        command: ["npm", "run", "lint"]
        fix: ["npm", "run", "lint:fix"]
      # optional host binary: missing → warn; findings → fail
      - name: gitleaks
        command: ["gitleaks", "detect", "--source", "."]
        onMissing: warn
    detect: git
    suites:
      lib:
        paths: ["packages/lib/"]
        command: ["npm", "run", "test:lib"]
      deps:
        paths: ["package.json", "package-lock.json"]
        also: [lib]   # select-only suite: no command, only expands also
    always: []
  - id: docs
    kind: guidance
    summary: Update owning docs if a contract changed
```

Suite ids, paths, and commands are entirely yours. A suite may omit `command` when it only expands `also`. JSON Schema: [schema/evolving.schema.json](schema/evolving.schema.json).

- `kind: prepare` — write-allowed; optional (omit the stage → empty prepare).
- `fix` on a check step — included in JSON `failure[]` / step fields when that step fails under `check` / `verify`; not executed there. Prefer `evolving prepare` (or the printed argv) over hand edits.
- `onMissing: warn` on a gate command — if the executable is not on PATH (`spawn` ENOENT), print a warn and continue; real non-zero exits from an installed tool still fail.
- `.evolving/last-run.json` — written after prepare/check/verify/finish; safe to gitignore in consumer repos.
- `.evolving/logs/` — full per-step stdout/stderr; every `step.log` points here.

## Design notes

- Prepare writes; check / verify assert. Keep that split so local gates stay trustworthy and CI can mirror read-only checks.
- CI belongs in each repo’s GitHub Actions (or other) workflow — this package does not define `evolving ci`.
- `skip_when` on guidance stages is documentation for agents; the CLI does not evaluate it.
- evolving is a deterministic gate runner + progressive checklist, not an agent runtime (no LangGraph).
- Agent protocol lives only in `evolving explain` / contract + this repo’s `evolving.yml` — not in a second consumer handbook.
