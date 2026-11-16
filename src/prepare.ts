import { emitRun } from "./emit.ts";
import { buildRunReport, createReporter, timestamp } from "./report.ts";
import { createRunner, installSignalHandlers } from "./run.ts";
import type { EvolvingConfig, RunReport } from "./types.ts";

/** Run write-allowed `gates.prepare` steps (format / lint:fix). */
export async function runPrepare(cwd: string, config: EvolvingConfig): Promise<RunReport> {
  const stamp = timestamp(new Date());
  const startedAt = Date.now();
  const steps = config.gates.prepare;

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
