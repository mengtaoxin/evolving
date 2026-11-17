import {
  changedPathsFromGit,
  resolveSelectedCommandIds,
  runnableSelectedIds,
} from "./detect.ts";
import { emitRun } from "./emit.ts";
import { buildRunReport, createReporter, timestamp } from "./report.ts";
import { createRunner, installSignalHandlers } from "./run.ts";
import { machineStages } from "./stages-access.ts";
import type { EvolvingConfig, GateCommand, RunReport } from "./types.ts";

/**
 * Run every non-guidance stage in order:
 * prepare commands → verify commands (git select + always-on) → kind: run.
 */
export async function runFinish(cwd: string, config: EvolvingConfig): Promise<RunReport> {
  const stamp = timestamp(new Date());
  const startedAt = Date.now();
  const { children, runCommand } = createRunner(cwd);
  installSignalHandlers(children);
  const { failed, steps, report } = createReporter(cwd, stamp);

  for (const stage of machineStages(config)) {
    if (stage.kind === "prepare") {
      for (const step of stage.commands) {
        const result = await runCommand(step);
        report(step.name ?? step.command.join(" "), [result], {
          showOutputOnSuccess: step.showOutputOnSuccess === true,
          onMissing: step.onMissing,
        });
      }
      continue;
    }

    if (stage.kind === "verify") {
      const changed = changedPathsFromGit(cwd);
      const selected = resolveSelectedCommandIds(stage, [], changed);
      const runnable = runnableSelectedIds(stage, selected);
      const byId = new Map(stage.commands.map((c) => [c.id, c]));
      for (const id of runnable) {
        const cmd = byId.get(id);
        if (!cmd) continue;
        const step: GateCommand = {
          name: cmd.id,
          command: cmd.command,
          env: cmd.env,
          showOutputOnSuccess: cmd.showOutputOnSuccess,
          onMissing: cmd.onMissing,
        };
        report(cmd.id, [await runCommand(step)], {
          showOutputOnSuccess: cmd.showOutputOnSuccess === true,
          onMissing: cmd.onMissing,
        });
      }
      continue;
    }

    const cmd: GateCommand = {
      name: stage.id,
      command: stage.command,
      env: stage.env,
    };
    report(stage.id, [await runCommand(cmd)]);
  }

  return emitRun(
    cwd,
    buildRunReport({
      command: "finish",
      startedAt,
      failed,
      steps,
    }),
  );
}
