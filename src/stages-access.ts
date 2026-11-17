import type { EvolvingConfig, Stage, StageCommand } from "./types.ts";

/** True when the stage has no commands (agent-evaluated). */
export function isAgentStage(stage: Stage): boolean {
  return stage.commands === undefined;
}

/** True when the stage has commands (CLI-runnable). */
export function isMachineStage(stage: Stage): stage is Stage & {
  commands: readonly StageCommand[];
} {
  return stage.commands !== undefined && stage.commands.length > 0;
}

/** Machine stages finish executes, in document order. */
export function machineStages(
  config: EvolvingConfig,
): readonly (Stage & { commands: readonly StageCommand[] })[] {
  return config.stages.filter(isMachineStage);
}

export function findStage(config: EvolvingConfig, id: string): Stage | undefined {
  return config.stages.find((s) => s.id === id);
}

/**
 * Walk backward from `fromStageId` (exclusive) and return the nearest stage
 * without commands. Used for failure resume (typically the edit checkpoint).
 */
export function nearestPriorAgentStage(
  config: EvolvingConfig,
  fromStageId: string,
): Stage | null {
  const index = config.stages.findIndex((s) => s.id === fromStageId);
  if (index <= 0) return null;
  for (let i = index - 1; i >= 0; i--) {
    const stage = config.stages[i] as Stage;
    if (isAgentStage(stage)) return stage;
  }
  return null;
}

export function stageCommands(stage: Stage): readonly StageCommand[] {
  return stage.commands ?? [];
}

/** True when the stage declares the given tag (exact string match). */
export function stageHasTag(stage: Stage, tag: string): boolean {
  return stage.tags?.includes(tag) === true;
}

/** Stages that declare `tag`, in document order. */
export function stagesWithTag(config: EvolvingConfig, tag: string): readonly Stage[] {
  return config.stages.filter((s) => stageHasTag(s, tag));
}
