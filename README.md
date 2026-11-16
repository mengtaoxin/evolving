# @mengtaoxin/evolving

Project-agnostic change-finish workflow and serial **check** / **verify** runner.

Put an `evolving.yml` at the repo root. The CLI loads that file and `spawn`s the commands you declare. Formatters, linters, and test runners stay in the consumer repo.

## Install

```bash
npm install -D @mengtaoxin/evolving
```

## Commands

| Command | Behavior |
| --- | --- |
| `evolving workflow` | Print the workflow checklist (including guidance steps) |
| `evolving check` | Run `gates.check` only |
| `evolving verify` | `gates.check`, then suites from git detect (or explicit ids), then `gates.verify.always` |
| `evolving finish` | Run every `workflow` step with `kind: run` |

Flags: `--config <path>`, `verify --check` (static gates only), `verify --e2e` (accepted no-op for older habits).

## Config sketch

```yaml
version: 1

workflow:
  - id: orient
    kind: guidance
    summary: Locate entry files for this repo
    skip_when: entry_file_known
  - id: verify
    kind: run
    command: ["npx", "evolving", "verify"]

gates:
  check:
    - command: ["npm", "run", "format:check"]
    - command: ["npm", "run", "lint"]
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

## Design notes

- Read-only gates: run `npm run format` (or equivalent) yourself when the tree needs writing.
- CI belongs in each repo’s GitHub Actions (or other) workflow — this package does not define `evolving ci`.
- `skip_when` on guidance steps is documentation for agents; the CLI does not evaluate it.
