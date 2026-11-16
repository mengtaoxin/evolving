# evolving (change-finish)

Copy into your repo’s `AGENTS.md` or Cursor rules.

## Discovery (do this first)

```bash
npx evolving explain --json
# then drill, e.g.:
npx evolving explain prepare --json
npx evolving explain verify --json
```

Do **not** dump every topic or the full USAGE up front. Use progressive `explain <topic>`.

## Required after code edits

1. `evolving prepare --json` (may write: format / lint:fix)
2. `evolving verify --json` (read-only checks + selected tests)

Prefer `--json` on every command so failures expose `fix`, `log`, and `selected_suites` without scraping human stdout.

## Do / don’t

- Do start with `evolving explain --json` for this repo’s short card + topic index.
- Do treat `kind: guidance` steps yourself; the CLI does not execute them (`explain guidance`).
- Do use `evolving finish` only after guidance is done; it runs `kind: run` only (prepare + verify when those are in workflow).
- Do not hand-edit formatting/lint when `gates.prepare` or a check `fix` companion exists — run prepare / the printed fix argv instead.
- Do not invent one-off npm scripts for gates already declared in `evolving.yml`.

## Resume

If context was lost: `evolving status --json` reads `.evolving/last-run.json` and suggests `next`.

## Protocol

```bash
npx evolving explain contract --json
# alias: npx evolving agent-contract --json
```
