import type { AgentContract, AfterEditStep, EvolvingConfig } from "./types.ts";

/** Recommended skip_when tokens for agents; free text still allowed in YAML. */
export const SKIP_WHEN_VOCABULARY = [
  "entry_file_known",
  "docs_only",
  "no_behavior_change",
  "already_verified",
] as const;

/** Hard anti-patterns for consuming evolving JSON (explain json / contract). */
export const AGENT_IO_DO_NOT = [
  "Never pipe evolving through head / tail / less / jq to skim results",
  "Never truncate evolving stdout with shell pipes for reading",
  "Never tee evolving output just to capture the result JSON",
  "Never re-run a long gate only because the agent view truncated stdout — recover via status + step.log",
  "Evolving already compresses success and previews failures — you must not second-truncate",
  "Do not restate this protocol in downstream AGENTS.md / rules — evolving explain is the only source",
] as const;

export const AGENT_IO_DO = [
  "Read the full stdout JSON object from evolving (no pipes)",
  "On failure, use failure[] / output_preview to locate the error; Read step.log for the full text",
  "If the agent view truncated stdout: evolving status (or status --full), then Read step.log — do not re-run to re-read",
  "Start with evolving explain (map + next first step); work top-down — no CLI dumps full stages detail",
  "Machine detail: explain prepare|check|verify. Guidance body: Read evolving.yml for the current step only",
] as const;

const DEFAULT_AFTER_EDIT: readonly AfterEditStep[] = ["prepare", "verify"];

export const AGENT_CONTRACT: AgentContract = {
  order: DEFAULT_AFTER_EDIT,
  after_edit: DEFAULT_AFTER_EDIT,
  prepare_writes: true,
  check_verify_readonly: true,
  finish_runs: "non-guidance stages",
  guidance: "agent-evaluated; CLI does not execute",
  protocol_source: "evolving explain",
  do_not_duplicate_in_downstream_docs: true,
  do_not_hand_edit_when_fix_exists: true,
  skip_when_vocabulary: SKIP_WHEN_VOCABULARY,
};

/** Contract merged with this repo's after_edit (from evolving.yml). */
export function agentContractFor(config: EvolvingConfig | null): AgentContract {
  if (!config) return AGENT_CONTRACT;
  return {
    ...AGENT_CONTRACT,
    order: config.after_edit,
    after_edit: config.after_edit,
  };
}

/** Human/agent-readable protocol — sole source; downstream docs only point at explain. */
export function agentContractText(config: EvolvingConfig | null = null): string {
  const contract = agentContractFor(config);
  const order = contract.after_edit.join(" → ");
  return `evolving agent contract
=======================
Protocol source: evolving explain (and this contract). Downstream AGENTS.md must only
point agents at explain — do not duplicate these rules in the consumer repo.

0. Start with: evolving explain (map + next). Work top-down. There is no CLI panorama —
   neither explain nor evolving stages dumps every stage's body/commands at once.
1. After editing code, run after_edit in order: ${order}
   (typically: evolving prepare, then evolving verify).
2. stdout is always one quiet JSON object. Never head/tail/tee/less/jq-pipe it.
3. kind: guidance stages are for the agent; the CLI never executes them or evaluates skip_when.
   Read evolving.yml for the current guidance step only (summary / refs / skip_when).
4. evolving finish runs every non-guidance stage in order (prepare steps, verify=check+suites+always, kind: run).
5. Do not hand-edit formatting/lint when a prepare stage or a check fix companion exists.
6. On failure, read failure[] / fix / log from the JSON report (or evolving status), then retry.
7. Full step output lives under .evolving/logs/ (path on each step.log). If your view
   truncated the JSON, run evolving status --full and Read the log — do not re-run to re-read.
8. skip_when is agent-evaluated. Recommended tokens: ${SKIP_WHEN_VOCABULARY.join(", ")}.
9. check is nested under kind: verify (check ⊂ verify). evolving check runs that subset only.
10. Machine detail on demand: evolving explain prepare|check|verify. evolving stages is a
    minimal id+kind map (+ first), not a full timeline dump.

do:
${AGENT_IO_DO.map((line) => `- ${line}`).join("\n")}

do_not:
${AGENT_IO_DO_NOT.map((line) => `- ${line}`).join("\n")}
`;
}
