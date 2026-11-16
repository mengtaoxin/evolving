import type { EvolvingConfig, GateCommand } from "./types.ts";
import { createReporter, timestamp } from "./report.ts";
import { createRunner, installSignalHandlers } from "./run.ts";

/** Run every workflow step with kind run (skip guidance). */
export async function runFinish(cwd: string, config: EvolvingConfig): Promise<number> {
  const stamp = timestamp(new Date());
  const startedAt = Date.now();
  const { children, runCommand } = createRunner(cwd);
  installSignalHandlers(children);
  const { failed, report } = createReporter(stamp);

  const runs = config.workflow.filter((step) => step.kind === "run");
  if (runs.length === 0) {
    console.log("– finish: no kind:run steps in workflow");
  }
  for (const step of runs) {
    if (!step.command) continue;
    const cmd: GateCommand = {
      name: step.id,
      command: step.command,
      env: step.env,
    };
    report(step.id, [await runCommand(cmd)]);
  }

  const total = ((Date.now() - startedAt) / 1000).toFixed(1);
  if (failed.length === 0) {
    console.log(`✔ finish passed · ${total}s`);
    return 0;
  }
  console.log(`✘ finish failed: ${failed.join(", ")} · ${total}s`);
  return 1;
}
