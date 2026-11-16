# @mengtaoxin/evolving

Project-agnostic change-finish workflow and serial **prepare** / **check** / **verify** runner.

Put an `evolving.yml` at the repo root. The CLI loads that file and `spawn`s the commands you declare. Formatters, linters, and test runners stay in the consumer repo.

Designed for **agents first**: progressive `explain`, stable `--json` reports, a fixed `contract`, and `.evolving/last-run.json` for resume. Human text output remains the default.

## Install

```bash
npm install -D @mengtaoxin/evolving
```

## Commands

| Command | Behavior |
| --- | --- |
| `evolving explain [topic]` | **Agent entry**: short card + topic index, or one topic drilled with this repo’s `evolving.yml` |
| `evolving workflow` | Print the workflow checklist (including guidance steps and `gates.prepare`) |
| `evolving prepare` | Run `gates.prepare` only (may write the tree: format / lint:fix) |
| `evolving check` | Run `gates.check` only (read-only) |
| `evolving verify` | `gates.check`, then suites from git detect (or explicit ids), then `gates.verify.always` (read-only) |
| `evolving finish` | Run every `workflow` step with `kind: run` (skips guidance by design) |
| `evolving status` | Read `.evolving/last-run.json` and suggest `next` |
| `evolving agent-contract` | Alias of `explain contract` |

Flags: `--config <path>`, `--json` (stdout is one JSON object), `verify --check` (static gates only), `verify --e2e` (accepted no-op for older habits).

**Order:** after editing code, run `evolving prepare`, then `evolving verify`. Do not hand-edit whitespace when a prepare / `fix` companion exists. `check` and `verify` never mutate the tree.

## Agent usage

Progressive discovery — do **not** dump every command or the full checklist first:

```bash
evolving explain --json                 # who am I, contract.order, project summary, topics
evolving explain prepare --json         # drill one topic (merged with evolving.yml)
evolving explain verify --json
evolving prepare --json                 # then act
evolving verify --json
# on failure:
evolving status --json
```

Topics: `contract`, `prepare`, `check`, `verify`, `finish`, `workflow`, `status`, `json`, `guidance`.

- Guidance steps (`kind: guidance`, `skip_when`) are **agent-evaluated**; the CLI never executes them.
- `finish` only runs `kind: run`. Put `prepare` and `verify` as `run` steps so finish matches prepare → verify.
- Recommended `skip_when` tokens: `entry_file_known`, `docs_only`, `no_behavior_change`, `already_verified` (free text still allowed).
- `workflow --json` remains available for a full plan snapshot after you know you need it.
- Copy [templates/AGENTS.evolving.md](templates/AGENTS.evolving.md) into the consumer repo to pin this protocol.

## Config sketch

```yaml
version: 1

workflow:
  - id: orient
    kind: guidance
    summary: Locate entry files for this repo
    skip_when: entry_file_known
  - id: prepare
    kind: run
    command: ["npx", "evolving", "prepare"]
  - id: verify
    kind: run
    command: ["npx", "evolving", "verify"]

gates:
  prepare:
    - name: format
      command: ["npm", "run", "format"]
    - name: lint:fix
      command: ["npm", "run", "lint:fix"]
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
  verify:
    detect: git
    suites:
      lib:
        paths: ["packages/lib/"]
        command: ["npm", "run", "test:lib"]
      deps:
        paths: ["package.json", "package-lock.json"]
        also: [lib]   # select-only suite: no command, only expands also
    always: []
```

Suite ids, paths, and commands are entirely yours. A suite may omit `command` when it only expands `also`. JSON Schema: [schema/evolving.schema.json](schema/evolving.schema.json).

- `gates.prepare` — write-allowed; optional (defaults to `[]`).
- `fix` on a check step — printed as `fix: …` (and included in `--json`) when that step fails under `check` / `verify`; not executed there. Prefer `evolving prepare` (or the printed argv) over hand edits.
- `onMissing: warn` on a gate command — if the executable is not on PATH (`spawn` ENOENT), print a warn and continue; real non-zero exits from an installed tool still fail. Useful for optional host tools (e.g. gitleaks, lychee).
- `.evolving/last-run.json` — written after prepare/check/verify/finish; safe to gitignore in consumer repos.

## Design notes

- Prepare writes; check / verify assert. Keep that split so local gates stay trustworthy and CI can mirror read-only checks.
- CI belongs in each repo’s GitHub Actions (or other) workflow — this package does not define `evolving ci`.
- `skip_when` on guidance steps is documentation for agents; the CLI does not evaluate it.
- evolving is a deterministic gate runner + checklist, not an agent runtime (no LangGraph).
