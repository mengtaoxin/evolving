import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { parse as parseYaml } from "yaml";
import type {
  AfterEditStep,
  EvolvingConfig,
  GateCommand,
  GuidanceStage,
  PrepareStage,
  RunStage,
  Stage,
  VerifyCommand,
  VerifyStage,
} from "./types.ts";
import {
  COMMAND_REF_PREFIX,
  commandRefId,
  isCommandRef,
  isRefOnlyCommand,
} from "./types.ts";

const CONFIG_NAME = "evolving.yml";

const REMOVED_VERIFY_KEYS = [
  "check",
  "detect",
  "suites",
  "always",
  "steps",
] as const;

export function configPath(cwd: string, explicit?: string): string {
  if (explicit) return isAbsolute(explicit) ? explicit : join(cwd, explicit);
  return join(cwd, CONFIG_NAME);
}

export function loadConfig(cwd: string, explicitPath?: string): EvolvingConfig {
  const path = configPath(cwd, explicitPath);
  let rawText: string;
  try {
    rawText = readFileSync(path, "utf8");
  } catch {
    throw new Error(`Missing ${CONFIG_NAME} at ${path}`);
  }
  const raw: unknown = parseYaml(rawText);
  return parseConfig(raw, path);
}

export function parseConfig(raw: unknown, source = "evolving.yml"): EvolvingConfig {
  if (!isRecord(raw)) throw new Error(`${source}: root must be a mapping`);
  if (raw.version === 1) {
    throw new Error(`${source}: version 1 is not supported; use version: 2 (stages + after_edit)`);
  }
  if (raw.version !== 2) throw new Error(`${source}: version must be 2`);

  const after_edit = parseAfterEdit(raw.after_edit, `${source}: after_edit`);
  const stagesRaw = requireArray(raw.stages, `${source}: stages`);
  if (stagesRaw.length === 0) throw new Error(`${source}: stages must be non-empty`);

  const stages = stagesRaw.map((item, i) => parseStage(item, `${source}: stages[${i}]`));
  assertStageUniqueness(stages, source);
  assertVerifyCommandGraph(stages, source);

  return { version: 2, after_edit, stages };
}

function parseAfterEdit(raw: unknown, label: string): readonly AfterEditStep[] {
  const arr = requireArray(raw, label);
  if (arr.length !== 2 || arr[0] !== "prepare" || arr[1] !== "verify") {
    throw new Error(`${label} must be [prepare, verify]`);
  }
  return ["prepare", "verify"];
}

function assertStageUniqueness(stages: readonly Stage[], source: string): void {
  const prepares = stages.filter((s) => s.kind === "prepare");
  if (prepares.length > 1) {
    throw new Error(`${source}: at most one kind: prepare stage allowed`);
  }
  const verifies = stages.filter((s) => s.kind === "verify");
  if (verifies.length !== 1) {
    throw new Error(`${source}: exactly one kind: verify stage is required`);
  }
  const ids = new Set<string>();
  for (const stage of stages) {
    if (ids.has(stage.id)) throw new Error(`${source}: duplicate stage id "${stage.id}"`);
    ids.add(stage.id);
  }
}

function assertVerifyCommandGraph(stages: readonly Stage[], source: string): void {
  const verify = stages.find((s): s is VerifyStage => s.kind === "verify");
  if (!verify) return;
  const byId = new Map(verify.commands.map((c) => [c.id, c]));
  for (const cmd of verify.commands) {
    if (!isRefOnlyCommand(cmd.command)) continue;
    for (const token of cmd.command) {
      const refId = commandRefId(token);
      if (!byId.has(refId)) {
        throw new Error(
          `${source}: verify command "${cmd.id}" references unknown ${COMMAND_REF_PREFIX}${refId}`,
        );
      }
      if (refId === cmd.id) {
        throw new Error(`${source}: verify command "${cmd.id}" must not reference itself`);
      }
    }
  }
}

function parseStage(raw: unknown, label: string): Stage {
  const obj = requireRecord(raw, label);
  const id = requireString(obj.id, `${label}.id`);
  const kind = obj.kind;
  if (kind === "guidance") return parseGuidanceStage(obj, id, label);
  if (kind === "prepare") return parsePrepareStage(obj, id, label);
  if (kind === "verify") return parseVerifyStage(obj, id, label);
  if (kind === "run") return parseRunStage(obj, id, label);
  throw new Error(`${label}.kind must be guidance, prepare, verify, or run`);
}

function parseGuidanceStage(
  obj: Record<string, unknown>,
  id: string,
  label: string,
): GuidanceStage {
  forbidKeys(obj, label, [
    "command",
    "commands",
    "steps",
    "check",
    "detect",
    "suites",
    "always",
    "env",
    "fix",
  ]);
  const stage: GuidanceStage = { id, kind: "guidance" };
  if (obj.summary !== undefined) stage.summary = requireString(obj.summary, `${label}.summary`);
  if (obj.skip_when !== undefined) {
    stage.skip_when = requireString(obj.skip_when, `${label}.skip_when`);
  }
  if (obj.refs !== undefined) {
    stage.refs = requireArray(obj.refs, `${label}.refs`).map((r, i) =>
      requireString(r, `${label}.refs[${i}]`),
    );
  }
  return stage;
}

function parsePrepareStage(obj: Record<string, unknown>, id: string, label: string): PrepareStage {
  if (obj.steps !== undefined) {
    throw new Error(`${label}: use commands (steps was renamed)`);
  }
  forbidKeys(obj, label, [
    "command",
    "summary",
    "refs",
    "skip_when",
    "check",
    "detect",
    "suites",
    "always",
    "fix",
  ]);
  const commands = requireArray(obj.commands, `${label}.commands`).map((item, i) =>
    parsePrepareCommand(item, `${label}.commands[${i}]`),
  );
  return { id, kind: "prepare", commands };
}

function parseVerifyStage(obj: Record<string, unknown>, id: string, label: string): VerifyStage {
  for (const key of REMOVED_VERIFY_KEYS) {
    if (obj[key] !== undefined) {
      throw new Error(
        `${label}: ${key} was removed; use a single commands list (run_in_file_change + command://)`,
      );
    }
  }
  forbidKeys(obj, label, ["command", "summary", "refs", "skip_when", "env", "fix"]);
  const rawCommands = requireArray(obj.commands, `${label}.commands`);
  if (rawCommands.length === 0) {
    throw new Error(`${label}.commands must be non-empty`);
  }
  const commands = rawCommands.map((item, i) =>
    parseVerifyCommand(item, `${label}.commands[${i}]`),
  );
  const seen = new Set<string>();
  for (const cmd of commands) {
    if (seen.has(cmd.id)) {
      throw new Error(`${label}: duplicate command id "${cmd.id}"`);
    }
    seen.add(cmd.id);
  }
  return { id, kind: "verify", commands };
}

function parseRunStage(obj: Record<string, unknown>, id: string, label: string): RunStage {
  forbidKeys(obj, label, [
    "steps",
    "commands",
    "summary",
    "refs",
    "skip_when",
    "check",
    "detect",
    "suites",
    "always",
    "fix",
  ]);
  const stage: RunStage = {
    id,
    kind: "run",
    command: requireCommand(obj.command, `${label}.command`),
  };
  if (obj.env !== undefined) stage.env = requireStringRecord(obj.env, `${label}.env`);
  return stage;
}

function forbidKeys(
  obj: Record<string, unknown>,
  label: string,
  keys: readonly string[],
): void {
  for (const key of keys) {
    if (obj[key] !== undefined) {
      throw new Error(`${label}: must not set ${key}`);
    }
  }
}

function parsePrepareCommand(raw: unknown, label: string): GateCommand {
  const obj = requireRecord(raw, label);
  forbidKeys(obj, label, ["fix", "run_in_file_change", "id", "also", "paths"]);
  if (obj.command !== undefined) {
    const argv = requireCommand(obj.command, `${label}.command`);
    if (argv.some(isCommandRef)) {
      throw new Error(`${label}.command: command:// refs are only allowed under verify`);
    }
  }
  return parseGateCommand(obj, label);
}

function parseVerifyCommand(raw: unknown, label: string): VerifyCommand {
  const obj = requireRecord(raw, label);
  forbidKeys(obj, label, ["fix", "also", "paths", "steps"]);
  const name = requireString(obj.name, `${label}.name`);
  const id =
    obj.id === undefined ? name : requireString(obj.id, `${label}.id`);
  const command = requireCommand(obj.command, `${label}.command`);
  assertCommandArgvShape(command, label);

  const cmd: VerifyCommand = { id, name, command };
  if (obj.run_in_file_change !== undefined) {
    const paths = requireArray(obj.run_in_file_change, `${label}.run_in_file_change`).map(
      (p, i) => requireString(p, `${label}.run_in_file_change[${i}]`),
    );
    if (paths.length === 0) {
      throw new Error(`${label}.run_in_file_change must be non-empty when set`);
    }
    cmd.run_in_file_change = paths;
  }
  if (obj.env !== undefined) {
    if (isRefOnlyCommand(command)) {
      throw new Error(`${label}: env is not allowed on command:// composition entries`);
    }
    cmd.env = requireStringRecord(obj.env, `${label}.env`);
  }
  if (obj.showOutputOnSuccess !== undefined) {
    if (typeof obj.showOutputOnSuccess !== "boolean") {
      throw new Error(`${label}.showOutputOnSuccess must be a boolean`);
    }
    if (isRefOnlyCommand(command)) {
      throw new Error(
        `${label}: showOutputOnSuccess is not allowed on command:// composition entries`,
      );
    }
    cmd.showOutputOnSuccess = obj.showOutputOnSuccess;
  }
  if (obj.onMissing !== undefined) {
    if (obj.onMissing !== "warn") {
      throw new Error(`${label}.onMissing must be "warn"`);
    }
    if (isRefOnlyCommand(command)) {
      throw new Error(`${label}: onMissing is not allowed on command:// composition entries`);
    }
    cmd.onMissing = "warn";
  }
  return cmd;
}

function assertCommandArgvShape(command: readonly string[], label: string): void {
  const refs = command.filter(isCommandRef);
  if (refs.length === 0) return;
  if (refs.length !== command.length) {
    throw new Error(
      `${label}.command: mix of argv tokens and ${COMMAND_REF_PREFIX} refs is not allowed`,
    );
  }
  for (const token of refs) {
    const refId = commandRefId(token);
    if (refId.length === 0) {
      throw new Error(`${label}.command: ${COMMAND_REF_PREFIX} id must be non-empty`);
    }
  }
}

function parseGateCommand(obj: Record<string, unknown>, label: string): GateCommand {
  const cmd: GateCommand = { command: requireCommand(obj.command, `${label}.command`) };
  if (obj.name !== undefined) cmd.name = requireString(obj.name, `${label}.name`);
  if (obj.env !== undefined) cmd.env = requireStringRecord(obj.env, `${label}.env`);
  if (obj.showOutputOnSuccess !== undefined) {
    if (typeof obj.showOutputOnSuccess !== "boolean") {
      throw new Error(`${label}.showOutputOnSuccess must be a boolean`);
    }
    cmd.showOutputOnSuccess = obj.showOutputOnSuccess;
  }
  if (obj.fix !== undefined) {
    throw new Error(`${label}: fix was removed; use evolving prepare for write-side commands`);
  }
  if (obj.onMissing !== undefined) {
    if (obj.onMissing !== "warn") {
      throw new Error(`${label}.onMissing must be "warn"`);
    }
    cmd.onMissing = "warn";
  }
  return cmd;
}

function requireCommand(raw: unknown, label: string): string[] {
  const arr = requireArray(raw, label);
  if (arr.length === 0) throw new Error(`${label} must be a non-empty array`);
  return arr.map((item, i) => requireString(item, `${label}[${i}]`));
}

function requireStringRecord(raw: unknown, label: string): Record<string, string> {
  const obj = requireRecord(raw, label);
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    out[key] = requireString(value, `${label}.${key}`);
  }
  return out;
}

function requireRecord(raw: unknown, label: string): Record<string, unknown> {
  if (!isRecord(raw)) throw new Error(`${label} must be a mapping`);
  return raw;
}

function requireArray(raw: unknown, label: string): unknown[] {
  if (!Array.isArray(raw)) throw new Error(`${label} must be an array`);
  return raw;
}

function requireString(raw: unknown, label: string): string {
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return raw;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
