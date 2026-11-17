import type { EvolvingConfig, GateCommand, RunReport } from "./types.ts";
import {
  changedPathsFromGit,
  invalidSuiteArgs,
  resolveSuiteIds,
  suiteIdsFromConfig,
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
  const checkOnly = args.includes("--check");
  const suiteArgs = args.filter((arg) => !arg.startsWith("--"));
  const gate = verifyStage(config);
  const suiteIds = suiteIdsFromConfig(gate);
  const invalid = invalidSuiteArgs(suiteArgs, suiteIds);
  if (invalid.length > 0) {
    const message = `Unknown argument(s): ${invalid.join(", ")}. Expected ${[...suiteIds, "all"].join(", ")}, --check, --e2e.`;
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
          check_only: checkOnly,
          changed_paths_count: 0,
          selected_suites: [],
          always: [],
        },
      }),
    );
  }

  const stamp = timestamp(new Date());
  const startedAt = Date.now();
  const { children, runCommand } = createRunner(cwd);
  installSignalHandlers(children);
  const { failed, steps, report } = createReporter(cwd, stamp);

  for (const step of gate.check) {
    const result = await runCommand(step);
    report(step.name ?? step.command.join(" "), [result], {
      showOutputOnSuccess: step.showOutputOnSuccess === true,
      fix: step.fix,
      onMissing: step.onMissing,
    });
  }

  let changedPathsCount = 0;
  let selected: string[] = [];
  const alwaysNames: string[] = [];

  if (!checkOnly) {
    const changed = changedPathsFromGit(cwd);
    changedPathsCount = changed.length;
    selected = resolveSuiteIds(gate, suiteArgs, changed);
    for (const id of selected) {
      const suite = gate.suites[id];
      if (!suite?.command) continue;
      const step: GateCommand = {
        name: suite.name ?? id,
        command: suite.command,
        env: suite.env,
      };
      report(step.name ?? id, [await runCommand(step)]);
    }
    for (const step of gate.always ?? []) {
      alwaysNames.push(step.name ?? step.command.join(" "));
      const result = await runCommand(step);
      report(step.name ?? step.command.join(" "), [result], {
        showOutputOnSuccess: step.showOutputOnSuccess === true,
        onMissing: step.onMissing,
      });
    }
  }

  return emitRun(
    cwd,
    buildRunReport({
      command: "verify",
      startedAt,
      failed,
      steps,
      verify: {
        check_only: checkOnly,
        changed_paths_count: changedPathsCount,
        selected_suites: selected,
        always: alwaysNames,
      },
    }),
  );
}
