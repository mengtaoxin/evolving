import { agentContractFor } from "./contract.ts";
import { printJson } from "./report.ts";
import { isMachineStage } from "./stages-access.ts";
import type { EvolvingConfig, StageView, StagesView } from "./types.ts";

export function buildStagesView(config: EvolvingConfig): StagesView {
  const stages = config.stages.map(stageRow);
  return {
    evolving: 1,
    command: "stages",
    contract: agentContractFor(config),
    stages,
    first: stages[0] ?? null,
    progressive:
      "Minimal id+runnable map + first only — no panorama. Follow top-down; machine detail via evolving explain run if unknown; else evolving run directly; agent body via Read evolving.yml for the current step.",
  };
}

export function printStages(config: EvolvingConfig): void {
  printJson(buildStagesView(config));
}

function stageRow(stage: EvolvingConfig["stages"][number]): StageView {
  return { id: stage.id, runnable: isMachineStage(stage) };
}
