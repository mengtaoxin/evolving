import type { AgentContract } from "./types.ts";

/** Recommended skip_when tokens for agents; free text still allowed in YAML. */
export const SKIP_WHEN_VOCABULARY = [
  "entry_file_known",
  "docs_only",
  "no_behavior_change",
  "already_verified",
] as const;

/** Hard anti-patterns for consuming evolving JSON (explain json / contract). */
export const AGENT_IO_DO_NOT = [
  "Do not pipe evolving through head / tail / less to skim results",
  "Do not truncate evolving stdout with shell pipes for reading",
  "Do not tee evolving output just to capture the result JSON",
] as const;

export const AGENT_IO_DO = [
  "Read the full stdout JSON object from evolving",
  "On failure, run evolving status (or status --full)",
  "Use step output_preview to locate the error; read step.log for the full text",
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
0. Start with: evolving explain. If you already know the loop, run prepare then verify.
1. After editing code, run: evolving prepare, then evolving verify.
2. stdout is always one JSON object.
3. Guidance workflow steps are for the agent; the CLI never executes them.
4. evolving finish runs only workflow steps with kind: run (skips guidance).
   Put prepare and verify as kind: run so finish matches prepare → verify.
5. Do not hand-edit formatting/lint when gates.prepare or a check fix companion exists.
6. On failure, read failure[] / fix / log from the JSON report (or evolving status), then retry.
7. Do not head/tail/tee evolving stdout. Read the full JSON; details live in step.log.
8. skip_when is agent-evaluated. Recommended tokens: ${SKIP_WHEN_VOCABULARY.join(", ")}.

do:
${AGENT_IO_DO.map((line) => `- ${line}`).join("\n")}

do_not:
${AGENT_IO_DO_NOT.map((line) => `- ${line}`).join("\n")}
`;
}
