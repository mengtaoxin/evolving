import {
  changedPathsFromGit,
  resolveSuiteIds,
} from "./detect.ts";
import { emitRun } from "./emit.ts";
import { buildRunReport, createReporter, timestamp } from "./report.ts";
import { createRunner, installSignalHandlers } from "./run.ts";
import { machineStages } from "./stages-access.ts";
import type { EvolvingConfig, GateCommand, RunReport } from "./types.ts";

/**
 * Run every non-guidance stage in order:
 * prepare steps → verify (check + git suites + always) → kind: run commands.
 */
export async function runFinish(cwd: string, config: EvolvingConfig): Promise<RunReport> {
  const stamp = timestamp(new Date());
  const startedAt = Date.now();
  const { children, runCommand } = createRunner(cwd);
  installSignalHandlers(children);
  const { failed, steps, report } = createReporter(cwd, stamp);

  for (const stage of machineStages(config)) {
    if (stage.kind === "prepare") {
      for (const step of stage.steps) {
        const result = await runCommand(step);
        report(step.name ?? step.command.join(" "), [result], {
          showOutputOnSuccess: step.showOutputOnSuccess === true,
          onMissing: step.onMissing,
        });
      }
      continue;
    }

    if (stage.kind === "verify") {
      for (const step of stage.check) {
        const result = await runCommand(step);
        report(step.name ?? step.command.join(" "), [result], {
          showOutputOnSuccess: step.showOutputOnSuccess === true,
          fix: step.fix,
          onMissing: step.onMissing,
        });
      }
      const changed = changedPathsFromGit(cwd);
      const selected = resolveSuiteIds(stage, [], changed);
      for (const id of selected) {
        const suite = stage.suites[id];
        if (!suite?.command) continue;
        const step: GateCommand = {
          name: suite.name ?? id,
          command: suite.command,
          env: suite.env,
        };
        report(step.name ?? id, [await runCommand(step)]);
      }
      for (const step of stage.always ?? []) {
        const result = await runCommand(step);
        report(step.name ?? step.command.join(" "), [result], {
          showOutputOnSuccess: step.showOutputOnSuccess === true,
          onMissing: step.onMissing,
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
