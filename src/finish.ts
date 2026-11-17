import {
  changedPathsFromGit,
  resolveSelectedCommandIds,
  runnableSelectedIds,
} from "./detect.ts";
import { emitRun } from "./emit.ts";
import { buildRunReport, createReporter, timestamp } from "./report.ts";
import { createRunner, installSignalHandlers } from "./run.ts";
import { finishStages } from "./stages-access.ts";
import type { EvolvingConfig, RunReport } from "./types.ts";

/**
 * Run machine stages tagged `run-in-finish` in document order.
 * Skips agent stages and machine stages without that tag.
 */
export async function runFinish(cwd: string, config: EvolvingConfig): Promise<RunReport> {
  const stamp = timestamp(new Date());
  const startedAt = Date.now();
  const { children, runCommand } = createRunner(cwd);
  installSignalHandlers(children);
  const { failed, steps, report } = createReporter(cwd, stamp);

  for (const stage of finishStages(config)) {
    const changed = changedPathsFromGit(cwd);
    const selected = resolveSelectedCommandIds(stage, [], changed);
    const runnable = runnableSelectedIds(stage, selected);
    const byId = new Map(stage.commands.map((c) => [c.id, c]));
    for (const id of runnable) {
      const cmd = byId.get(id);
      if (!cmd) continue;
      report(
        cmd.id,
        [
          await runCommand({
            name: cmd.id,
            command: cmd.command,
            env: cmd.env,
            showOutputOnSuccess: cmd.showOutputOnSuccess,
            onMissing: cmd.onMissing,
          }),
        ],
        {
          showOutputOnSuccess: cmd.showOutputOnSuccess === true,
          onMissing: cmd.onMissing,
        },
      );
      if (failed.length > 0) {
        return emitRun(
          cwd,
          buildRunReport({
            command: "finish",
            startedAt,
            failed,
            steps,
            stage_id: stage.id,
          }),
        );
      }
    }
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
