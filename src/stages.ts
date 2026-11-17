import { agentContractFor } from "./contract.ts";
import { printJson } from "./report.ts";
import type { EvolvingConfig, StageView, StagesView } from "./types.ts";

export function buildStagesView(config: EvolvingConfig): StagesView {
  const stages = config.stages.map(stageRow);
  return {
    evolving: 1,
    command: "stages",
    contract: agentContractFor(config),
    after_edit: config.after_edit,
    stages,
    first: stages[0] ?? null,
    progressive:
      "Minimal id+kind map + first only — no panorama. Follow top-down; machine detail via explain prepare|verify; guidance body via Read evolving.yml for the current step.",
  };
}

export function printStages(config: EvolvingConfig): void {
  printJson(buildStagesView(config));
}

function stageRow(stage: EvolvingConfig["stages"][number]): StageView {
  return { id: stage.id, kind: stage.kind };
}
