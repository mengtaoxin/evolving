import type { EvolvingConfig, RunReport, Stage } from "./types.ts";
import {
  alwaysOnIds,
  changedPathsFromGit,
  commandIdsFromStage,
  invalidCommandArgs,
  resolveSelectedCommandIds,
  runnableSelectedIds,
} from "./detect.ts";
import { emitRun } from "./emit.ts";
import { buildRunReport, createReporter, timestamp } from "./report.ts";
import { createRunner, installSignalHandlers } from "./run.ts";
import { findStage, isMachineStage } from "./stages-access.ts";

/**
 * Run one stage by id.
 * - Machine stage: select + spawn commands (git path / command://).
 * - Agent stage (no commands): do not spawn; return ok with a clear message.
 */
export async function runStage(
  cwd: string,
  config: EvolvingConfig,
  stageId: string,
  args: readonly string[] = [],
): Promise<RunReport> {
  const stage = findStage(config, stageId);
  if (!stage) {
    return emitRun(
      cwd,
      buildRunReport({
        command: "run",
        startedAt: Date.now(),
        failed: ["args"],
        steps: [
          {
            name: "args",
            ok: false,
            code: 2,
            seconds: 0,
            output_preview: `Unknown stage id: ${stageId}. Expected: ${config.stages.map((s) => s.id).join(", ")}.`,
          },
        ],
        exitCode: 2,
        stage_id: stageId,
      }),
    );
  }

  if (!isMachineStage(stage)) {
    return emitRun(
      cwd,
      buildRunReport({
        command: "run",
        startedAt: Date.now(),
        failed: [],
        steps: [
          {
            name: stage.id,
            ok: true,
            code: 0,
            seconds: 0,
            output_preview: `Stage "${stage.id}" has no commands to run (agent stage).`,
          },
        ],
        stage_id: stage.id,
      }),
    );
  }

  return runMachineStage(cwd, stage, args);
}

export async function runMachineStage(
  cwd: string,
  stage: Stage & { commands: NonNullable<Stage["commands"]> },
  args: readonly string[] = [],
): Promise<RunReport> {
  const commandArgs = args.filter((arg) => !arg.startsWith("--"));
  const commandIds = commandIdsFromStage(stage);
  const invalid = invalidCommandArgs(commandArgs, commandIds);
  if (invalid.length > 0) {
    const message = `Unknown argument(s): ${invalid.join(", ")}. Expected ${[...commandIds, "all"].join(", ")}.`;
    return emitRun(
      cwd,
      buildRunReport({
        command: "run",
        startedAt: Date.now(),
        failed: ["args"],
        steps: [
          {
            name: "args",
            ok: false,
            code: 2,
            seconds: 0,
            output_preview: message,
          },
        ],
        exitCode: 2,
        stage_id: stage.id,
        selection: {
          changed_paths_count: 0,
          selected: [],
          always_on: [],
        },
      }),
    );
  }

  const stamp = timestamp(new Date());
  const startedAt = Date.now();
  const { children, runCommand } = createRunner(cwd);
  installSignalHandlers(children);
  const { failed, steps, report } = createReporter(cwd, stamp);

  const changed = changedPathsFromGit(cwd);
  const selected = resolveSelectedCommandIds(stage, commandArgs, changed);
  const runnable = runnableSelectedIds(stage, selected);
  const alwaysOn = alwaysOnIds(stage, selected);
  const byId = new Map(stage.commands.map((c) => [c.id, c]));

  for (const id of runnable) {
    const cmd = byId.get(id);
    if (!cmd) continue;
    const result = await runCommand({
      name: cmd.id,
      command: cmd.command,
      env: cmd.env,
      showOutputOnSuccess: cmd.showOutputOnSuccess,
      onMissing: cmd.onMissing,
    });
    report(cmd.id, [result], {
      showOutputOnSuccess: cmd.showOutputOnSuccess === true,
      onMissing: cmd.onMissing,
    });
  }

  return emitRun(
    cwd,
    buildRunReport({
      command: "run",
      startedAt,
      failed,
      steps,
      stage_id: stage.id,
      selection: {
        changed_paths_count: changed.length,
        selected: runnable,
        always_on: alwaysOn,
      },
    }),
  );
}
