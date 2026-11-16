# @mengtaoxin/evolving

Project-agnostic change-finish workflow and serial **prepare** / **check** / **verify** runner.

Put an `evolving.yml` at the repo root. The CLI loads that file and `spawn`s the commands you declare. Formatters, linters, and test runners stay in the consumer repo.

## Install

```bash
npm install -D @mengtaoxin/evolving
```

## Commands

| Command | Behavior |
| --- | --- |
| `evolving workflow` | Print the workflow checklist (including guidance steps and `gates.prepare`) |
| `evolving prepare` | Run `gates.prepare` only (may write the tree: format / lint:fix) |
| `evolving check` | Run `gates.check` only (read-only) |
| `evolving verify` | `gates.check`, then suites from git detect (or explicit ids), then `gates.verify.always` (read-only) |
| `evolving finish` | Run every `workflow` step with `kind: run` |

Flags: `--config <path>`, `verify --check` (static gates only), `verify --e2e` (accepted no-op for older habits).

**Order:** after editing code, run `evolving prepare`, then `evolving verify`. Do not hand-edit whitespace when a prepare / `fix` companion exists. `check` and `verify` never mutate the tree.

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
- `fix` on a check step — printed as `fix: …` when that step fails under `check` / `verify`; not executed there. Prefer `evolving prepare` (or the printed argv) over hand edits.

## Design notes

- Prepare writes; check / verify assert. Keep that split so local gates stay trustworthy and CI can mirror read-only checks.
- CI belongs in each repo’s GitHub Actions (or other) workflow — this package does not define `evolving ci`.
- `skip_when` on guidance steps is documentation for agents; the CLI does not evaluate it.
