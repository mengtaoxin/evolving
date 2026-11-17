#!/usr/bin/env node
import { printExplain, resolveExplain } from "./explain.ts";
import { loadConfig } from "./load-config.ts";
import { printJson } from "./report.ts";
import {
  parseCsvList,
  resolveStagesByIds,
  runStage,
  runStages,
  stagesMatchingTags,
} from "./run-stage.ts";
import { printStages } from "./stages.ts";
import { printStatus } from "./status.ts";

const USAGE = `Usage:
  evolving explain [topic] [--config path]
  evolving stages [--config path]
  evolving run <stage-id> [command-id|all...] [--config path]
  evolving run --tags tag1,tag2 [--config path]
  evolving run --ids id1,id2 [--config path]
  evolving status [--full] [--config path]
  evolving agent-contract   # alias: explain contract

For agents: evolving explain (sole protocol source).
Stages with commands are runnable; stages without are agent-only.
stdout is always one JSON object.
`;

const REMOVED_HINT =
  "use evolving run <stage-id>, evolving run --tags <tags>, or evolving run --ids <ids>";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help") {
    process.stdout.write(USAGE);
    process.exitCode = argv.length === 0 ? 2 : 0;
    return;
  }

  const command = argv[0] as string;
  const rest = argv.slice(1);
  const configFlag = takeFlagValue(rest, "--config");
  const full = takeFlag(rest, "--full");
  const cwd = process.cwd();

  if (command === "explain" || command === "agent-contract") {
    const topic = command === "agent-contract" ? "contract" : rest.find((a) => !a.startsWith("--"));
    if (command === "explain" && topic) {
      const index = rest.indexOf(topic);
      if (index !== -1) rest.splice(index, 1);
    }
    const { config, error } = tryLoadConfig(cwd, configFlag);
    const report = resolveExplain(topic, config, cwd, error);
    printExplain(report);
    process.exitCode = report.exit_code;
    return;
  }

  if (command === "status") {
    printStatus(cwd, { full });
    return;
  }

  if (command === "prepare" || command === "verify" || command === "check" || command === "finish") {
    printJson({
      evolving: 1,
      ok: false,
      exit_code: 2,
      error: `evolving ${command} was removed; ${REMOVED_HINT}`,
    });
    process.exitCode = 2;
    return;
  }

  let config;
  try {
    config = loadConfig(cwd, configFlag);
  } catch (err) {
    printJson({
      evolving: 1,
      ok: false,
      exit_code: 2,
      error: err instanceof Error ? err.message : String(err),
    });
    process.exitCode = 2;
    return;
  }

  switch (command) {
    case "stages":
      printStages(config);
      return;
    case "run": {
      const hasTags = rest.includes("--tags");
      const hasIds = rest.includes("--ids");
      const tagsRaw = takeFlagValue(rest, "--tags");
      const idsRaw = takeFlagValue(rest, "--ids");
      const stageId = rest.find((a) => !a.startsWith("--"));

      if (hasTags && hasIds) {
        printJson({
          evolving: 1,
          ok: false,
          exit_code: 2,
          error: "evolving run: use only one of --tags or --ids",
        });
        process.exitCode = 2;
        return;
      }

      if ((hasTags || hasIds) && stageId) {
        printJson({
          evolving: 1,
          ok: false,
          exit_code: 2,
          error:
            "evolving run: --tags/--ids cannot be combined with a stage id. Usage: evolving run <stage-id> | --tags <tags> | --ids <ids>",
        });
        process.exitCode = 2;
        return;
      }

      if (hasTags) {
        const tags = parseCsvList(tagsRaw);
        process.exitCode = (await runStages(cwd, stagesMatchingTags(config, tags))).exit_code;
        return;
      }

      if (hasIds) {
        const ids = parseCsvList(idsRaw);
        const resolved = resolveStagesByIds(config, ids);
        if (resolved.error) {
          printJson({
            evolving: 1,
            ok: false,
            exit_code: 2,
            error: resolved.error,
          });
          process.exitCode = 2;
          return;
        }
        process.exitCode = (await runStages(cwd, resolved.stages)).exit_code;
        return;
      }

      if (!stageId) {
        printJson({
          evolving: 1,
          ok: false,
          exit_code: 2,
          error:
            "evolving run requires a stage id, --tags, or --ids. Usage: evolving run <stage-id> [command-id|all...] | --tags <tags> | --ids <ids>",
        });
        process.exitCode = 2;
        return;
      }
      const index = rest.indexOf(stageId);
      if (index !== -1) rest.splice(index, 1);
      process.exitCode = (await runStage(cwd, config, stageId, rest)).exit_code;
      return;
    }
    default:
      console.error(`Unknown command: ${command}\n`);
      process.stdout.write(USAGE);
      process.exitCode = 2;
  }
}

function tryLoadConfig(
  cwd: string,
  configFlag?: string,
): { config: ReturnType<typeof loadConfig> | null; error?: string } {
  try {
    return { config: loadConfig(cwd, configFlag) };
  } catch (err) {
    return { config: null, error: err instanceof Error ? err.message : String(err) };
  }
}

function takeFlag(args: string[], flag: string): boolean {
  const index = args.indexOf(flag);
  if (index === -1) return false;
  args.splice(index, 1);
  return true;
}

function takeFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const value = args[index + 1];
  args.splice(index, value === undefined ? 1 : 2);
  return value;
}

await main();
