import type { AgentContract, EvolvingConfig } from "./types.ts";

/** Recommended skip_when tokens for agents; free text still allowed in YAML. */
export const SKIP_WHEN_VOCABULARY = [
  "entry_file_known",
  "docs_only",
  "no_behavior_change",
  "already_verified",
] as const;

/** Recommended stage tags; free text still allowed in YAML. */
export const TAGS_VOCABULARY = ["needs-agent"] as const;

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
  "Start with evolving explain (map + next action); work top-down through stages — no CLI dumps full stages detail",
  "next is an executable action, never a bare stage id. Agent step: Read evolving.yml for the current step. evolving explain <stage-id> returns that step's summary, refs, and skip_when only",
  "Machine detail: evolving explain run, only before evolving run. Agent body: Read evolving.yml for the current step only",
] as const;

export const AGENT_CONTRACT: AgentContract = {
  stages_order: "document",
  agent_stages: "no commands; agent-evaluated",
  machine_stages: "has commands; CLI run",
  resume_on_fail: "nearest prior agent stage",
  protocol_source: "evolving explain",
  do_not_duplicate_in_downstream_docs: true,
  skip_when_vocabulary: SKIP_WHEN_VOCABULARY,
  tags_vocabulary: TAGS_VOCABULARY,
};

/** Contract for this repo (config currently unused beyond future hooks). */
export function agentContractFor(_config: EvolvingConfig | null): AgentContract {
  return AGENT_CONTRACT;
}

/** Human/agent-readable protocol — sole source; downstream docs only point at explain. */
export function agentContractText(_config: EvolvingConfig | null = null): string {
  return `evolving agent contract
=======================
Protocol source: evolving explain (and this contract). Downstream AGENTS.md must only
point agents at explain — do not duplicate these rules in the consumer repo.

0. Start with: evolving explain (map + next action). Work top-down through stages. next is
   an executable action — an agent step says Read evolving.yml for the current step, never a
   bare stage id. There is no CLI panorama — neither explain nor evolving stages dumps every
   stage body/commands.
1. stages document order is the only protocol axis.
2. Stages with commands are machine stages — run via evolving run <stage-id>,
   evolving run --tags <tags>, or evolving run --ids <ids>.
   Stages without commands are agent stages — Read evolving.yml for summary/refs/skip_when/tags.
   evolving explain <stage-id> returns that step's summary, refs, and skip_when only.
3. Put an agent "edit" stage where the agent should change code (e.g. after orient, before gates).
4. stdout is always one quiet JSON object. Never head/tail/tee/less/jq-pipe it.
5. Tags are free text. Downstream chooses which tags mean what; evolving does not define a
   finish/wrap-up command. Filter with evolving run --tags when useful.
6. On failure, evolving status suggests the nearest prior agent stage (Read evolving.yml for that step), then evolving run the failed stage.
7. Full step output lives under .evolving/logs/ (path on each step.log). If your view
   truncated the JSON, run evolving status --full and Read the log — do not re-run to re-read.
8. skip_when is agent-evaluated. Recommended tokens: ${SKIP_WHEN_VOCABULARY.join(", ")}.
9. tags are optional labels on any stage. Recommended: ${TAGS_VOCABULARY.join(", ")}
   (semantic). Other tags are consumer-defined and usable with run --tags.
   Read evolving.yml for the current step to see tags — evolving stages / explain stages
   maps stay id+runnable only (no tags in the map).
10. Machine stage commands: omit run_in_file_change to always run; otherwise select via git paths.
   Composition: command://id refs within the same stage.
11. Machine detail only immediately before evolving run: evolving explain run.
    evolving stages is a minimal id+runnable map.

do:
${AGENT_IO_DO.map((line) => `- ${line}`).join("\n")}

do_not:
${AGENT_IO_DO_NOT.map((line) => `- ${line}`).join("\n")}
`;
}
