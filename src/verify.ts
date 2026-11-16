import type { EvolvingConfig, GateCommand, RunOptions, RunReport } from "./types.ts";
import {
  changedPathsFromGit,
  invalidSuiteArgs,
  resolveSuiteIds,
  suiteIdsFromConfig,
} from "./detect.ts";
import { emitRun } from "./emit.ts";
import {
  buildRunReport,
  createReporter,
  printRunSummary,
  timestamp,
} from "./report.ts";
import { createRunner, installSignalHandlers } from "./run.ts";

export async function runVerify(
  cwd: string,
  config: EvolvingConfig,
  args: readonly string[],
  options: RunOptions = {},
): Promise<RunReport> {
  const mode = options.mode ?? "human";
  const checkOnly = args.includes("--check");
  const suiteArgs = args.filter((arg) => !arg.startsWith("--"));
  const suiteIds = suiteIdsFromConfig(config.gates.verify);
  const invalid = invalidSuiteArgs(suiteArgs, suiteIds);
  if (invalid.length > 0) {
    const message = `Unknown argument(s): ${invalid.join(", ")}. Expected ${[...suiteIds, "all"].join(", ")}, --check, --e2e.`;
    if (mode === "human") console.error(message);
    return emitRun(
      cwd,
      buildRunReport({
        command: "verify",
        startedAt: Date.now(),
        failed: ["args"],
        steps: mode === "json"
          ? [
              {
                name: "args",
                ok: false,
                code: 2,
                seconds: 0,
                output_preview: message,
              },
            ]
          : [],
        exitCode: 2,
        verify: {
          check_only: checkOnly,
          changed_paths_count: 0,
          selected_suites: [],
          always: [],
        },
      }),
      mode,
    );
  }

  const stamp = timestamp(new Date());
  const startedAt = Date.now();
  const { children, runCommand } = createRunner(cwd);
  installSignalHandlers(children);
  const { failed, steps, report } = createReporter(stamp, mode);

  for (const step of config.gates.check) {
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
    selected = resolveSuiteIds(config.gates.verify, suiteArgs, changed);
    if (selected.length === 0 && mode === "human") {
      if (suiteArgs.length > 0) {
        console.log("– tests: skipped (selected suite(s) matched none)");
      } else {
        console.log("– tests: skipped (no matching changes; pass a suite id or all to force)");
      }
    }
    for (const id of selected) {
      const suite = config.gates.verify.suites[id];
      if (!suite?.command) continue;
      const step: GateCommand = {
        name: suite.name ?? id,
        command: suite.command,
        env: suite.env,
      };
      report(step.name ?? id, [await runCommand(step)]);
    }
    for (const step of config.gates.verify.always ?? []) {
      alwaysNames.push(step.name ?? step.command.join(" "));
      const result = await runCommand(step);
      report(step.name ?? step.command.join(" "), [result], {
        showOutputOnSuccess: step.showOutputOnSuccess === true,
        onMissing: step.onMissing,
      });
    }
  }

  const label = checkOnly ? "check" : "verify";
  const runReport = buildRunReport({
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
  });
  if (mode === "human") printRunSummary(label, failed, runReport.seconds);
  return emitRun(cwd, runReport, mode);
}
