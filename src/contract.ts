import type { AgentContract } from "./types.ts";

/** Recommended skip_when tokens for agents; free text still allowed in YAML. */
export const SKIP_WHEN_VOCABULARY = [
  "entry_file_known",
  "docs_only",
  "no_behavior_change",
  "already_verified",
] as const;

export const AGENT_CONTRACT: AgentContract = {
  order: ["prepare", "verify"],
  prepare_writes: true,
  check_verify_readonly: true,
  finish_runs: "workflow.kind=run only",
  guidance: "agent-evaluated; CLI does not execute",
  do_not_hand_edit_when_fix_exists: true,
  skip_when_vocabulary: SKIP_WHEN_VOCABULARY,
};

/** Human/agent-readable protocol for AGENTS.md / Cursor rules. */
export function agentContractText(): string {
  return `evolving agent contract
=======================
0. Start with: evolving explain --json (progressive topics; do not dump everything).
1. After editing code, run: evolving prepare, then evolving verify.
2. Prefer --json on every evolving command so results are machine-readable.
3. Guidance workflow steps are for the agent; the CLI never executes them.
4. evolving finish runs only workflow steps with kind: run (skips guidance).
   Put prepare and verify as kind: run so finish matches prepare → verify.
5. Do not hand-edit formatting/lint when gates.prepare or a check fix companion exists.
6. On failure, read fix / log from the JSON report (or evolving status --json), then retry.
7. skip_when is agent-evaluated. Recommended tokens: ${SKIP_WHEN_VOCABULARY.join(", ")}.
`;
}
