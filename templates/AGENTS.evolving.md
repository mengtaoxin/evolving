# evolving (change-finish)

Copy into your repo’s `AGENTS.md` or Cursor rules.

## Discovery (do this first)

```bash
npx evolving explain
# then drill, e.g.:
npx evolving explain prepare
npx evolving explain verify
```

Do **not** dump every topic or the full USAGE up front. Use progressive `explain <topic>`.

## Required after code edits

1. `evolving prepare` (may write: format / lint:fix)
2. `evolving verify` (read-only checks + selected tests)

stdout is always one quiet JSON object (`fix`, `log`, `failure[]`, `selected_suites`). Full step text is under `.evolving/logs/` (`step.log`).

## Do / don’t

- Do start with `evolving explain` for this repo’s short card + topic index.
- Do treat `kind: guidance` steps yourself; the CLI does not execute them (`explain guidance`).
- Do use `evolving finish` only after guidance is done; it runs `kind: run` only (prepare + verify when those are in workflow).
- Do not hand-edit formatting/lint when `gates.prepare` or a check `fix` companion exists — run prepare / the printed fix argv instead.
- Do not invent one-off npm scripts for gates already declared in `evolving.yml`.
- **Never** head / tail / tee / less / jq-pipe evolving stdout. Read the full JSON; evolving already slims success and previews failures.
- If your view truncated a long run: `evolving status --full`, then Read `step.log` — **do not re-run only to re-read**.

## Resume

If context was lost: `evolving status` reads `.evolving/last-run.json` and suggests `next`. Step logs live in `.evolving/logs/`.

## Protocol

```bash
npx evolving explain contract
# alias: npx evolving agent-contract
```
