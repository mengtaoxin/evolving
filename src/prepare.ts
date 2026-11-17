import { emitRun } from "./emit.ts";
import { buildRunReport, createReporter, timestamp } from "./report.ts";
import { createRunner, installSignalHandlers } from "./run.ts";
import { prepareSteps } from "./stages-access.ts";
import type { EvolvingConfig, RunReport } from "./types.ts";

/** Run write-allowed prepare stage steps (format / lint:fix). */
export async function runPrepare(cwd: string, config: EvolvingConfig): Promise<RunReport> {
  const stamp = timestamp(new Date());
  const startedAt = Date.now();
  const steps = prepareSteps(config);

  if (steps.length === 0) {
    return emitRun(
      cwd,
      buildRunReport({ command: "prepare", startedAt, failed: [], steps: [] }),
    );
  }

  const { children, runCommand } = createRunner(cwd);
  installSignalHandlers(children);
  const { failed, steps: reported, report } = createReporter(cwd, stamp);

  for (const step of steps) {
    const result = await runCommand(step);
    report(step.name ?? step.command.join(" "), [result], {
      showOutputOnSuccess: step.showOutputOnSuccess === true,
      onMissing: step.onMissing,
    });
  }

  return emitRun(
    cwd,
    buildRunReport({
      command: "prepare",
      startedAt,
      failed,
      steps: reported,
    }),
  );
}
