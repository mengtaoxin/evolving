import type { EvolvingConfig, GateCommand, RunReport } from "./types.ts";
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
import { verifyStage } from "./stages-access.ts";

export async function runVerify(
  cwd: string,
  config: EvolvingConfig,
  args: readonly string[],
): Promise<RunReport> {
  const commandArgs = args.filter((arg) => !arg.startsWith("--"));
  // Accept legacy no-op flags so older habits do not break argv parsing.
  const stage = verifyStage(config);
  const commandIds = commandIdsFromStage(stage);
  const invalid = invalidCommandArgs(commandArgs, commandIds);
  if (invalid.length > 0) {
    const message = `Unknown argument(s): ${invalid.join(", ")}. Expected ${[...commandIds, "all"].join(", ")}.`;
    return emitRun(
      cwd,
      buildRunReport({
        command: "verify",
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
        verify: {
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
    const step: GateCommand = {
      name: cmd.id,
      command: cmd.command,
      env: cmd.env,
      showOutputOnSuccess: cmd.showOutputOnSuccess,
      onMissing: cmd.onMissing,
    };
    const result = await runCommand(step);
    report(cmd.id, [result], {
      showOutputOnSuccess: cmd.showOutputOnSuccess === true,
      onMissing: cmd.onMissing,
    });
  }

  return emitRun(
    cwd,
    buildRunReport({
      command: "verify",
      startedAt,
      failed,
      steps,
      verify: {
        changed_paths_count: changed.length,
        selected: runnable,
        always_on: alwaysOn,
      },
    }),
  );
}
