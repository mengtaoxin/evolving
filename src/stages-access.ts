import type {
  EvolvingConfig,
  GateCommand,
  PrepareStage,
  RunStage,
  VerifyCommand,
  VerifyStage,
} from "./types.ts";

/** Commands from the optional prepare stage; empty when omitted. */
export function prepareCommands(config: EvolvingConfig): readonly GateCommand[] {
  const stage = config.stages.find((s): s is PrepareStage => s.kind === "prepare");
  return stage?.commands ?? [];
}

/** @deprecated Use prepareCommands */
export function prepareSteps(config: EvolvingConfig): readonly GateCommand[] {
  return prepareCommands(config);
}

/** The required verify stage (guaranteed by parseConfig). */
export function verifyStage(config: EvolvingConfig): VerifyStage {
  const stage = config.stages.find((s): s is VerifyStage => s.kind === "verify");
  if (!stage) throw new Error("evolving.yml: missing kind: verify stage");
  return stage;
}

export function verifyCommands(config: EvolvingConfig): readonly VerifyCommand[] {
  return verifyStage(config).commands;
}

/** Machine stages finish executes, in order (prepare / verify / run). */
export function machineStages(
  config: EvolvingConfig,
): readonly (PrepareStage | VerifyStage | RunStage)[] {
  return config.stages.filter(
    (s): s is PrepareStage | VerifyStage | RunStage => s.kind !== "guidance",
  );
}
