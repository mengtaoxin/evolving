import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { EvolvingConfig, Stage, StageCommand } from "./types.ts";
import {
  COMMAND_REF_PREFIX,
  commandRefId,
  isCommandRef,
  isRefOnlyCommand,
} from "./types.ts";

const CONFIG_NAME = "evolving.yml";

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
  if (raw.version !== 1) throw new Error(`${source}: version must be 1`);

  const stagesRaw = requireArray(raw.stages, `${source}: stages`);
  if (stagesRaw.length === 0) throw new Error(`${source}: stages must be non-empty`);

  const stages = stagesRaw.map((item, i) => parseStage(item, `${source}: stages[${i}]`));
  assertUniqueStageIds(stages, source);
  assertCommandGraphs(stages, source);

  return { version: 1, stages };
}

function assertUniqueStageIds(stages: readonly Stage[], source: string): void {
  const ids = new Set<string>();
  for (const stage of stages) {
    if (ids.has(stage.id)) throw new Error(`${source}: duplicate stage id "${stage.id}"`);
    ids.add(stage.id);
  }
}

function assertCommandGraphs(stages: readonly Stage[], source: string): void {
  for (const stage of stages) {
    if (!stage.commands) continue;
    const byId = new Map(stage.commands.map((c) => [c.id, c]));
    for (const cmd of stage.commands) {
      if (!isRefOnlyCommand(cmd.command)) continue;
      for (const token of cmd.command) {
        const refId = commandRefId(token);
        if (!byId.has(refId)) {
          throw new Error(
            `${source}: stage "${stage.id}" command "${cmd.id}" references unknown ${COMMAND_REF_PREFIX}${refId}`,
          );
        }
        if (refId === cmd.id) {
          throw new Error(
            `${source}: stage "${stage.id}" command "${cmd.id}" must not reference itself`,
          );
        }
      }
    }
  }
}

function parseStage(raw: unknown, label: string): Stage {
  const obj = requireRecord(raw, label);
  const id = requireString(obj.id, `${label}.id`);
  const stage: Stage = { id };

  if (obj.summary !== undefined) {
    stage.summary = requireString(obj.summary, `${label}.summary`);
  }
  if (obj.skip_when !== undefined) {
    stage.skip_when = requireString(obj.skip_when, `${label}.skip_when`);
  }
  if (obj.refs !== undefined) {
    stage.refs = requireArray(obj.refs, `${label}.refs`).map((r, i) =>
      requireString(r, `${label}.refs[${i}]`),
    );
  }
  if (obj.tags !== undefined) {
    const rawTags = requireArray(obj.tags, `${label}.tags`);
    if (rawTags.length === 0) {
      throw new Error(`${label}.tags must be non-empty when set`);
    }
    const tags = rawTags.map((t, i) => requireString(t, `${label}.tags[${i}]`));
    const seen = new Set<string>();
    for (const tag of tags) {
      if (seen.has(tag)) {
        throw new Error(`${label}.tags: duplicate tag "${tag}"`);
      }
      seen.add(tag);
    }
    stage.tags = tags;
  }
  if (obj.commands !== undefined) {
    const rawCommands = requireArray(obj.commands, `${label}.commands`);
    if (rawCommands.length === 0) {
      throw new Error(`${label}.commands must be non-empty when set (omit for agent stages)`);
    }
    const commands = rawCommands.map((item, i) =>
      parseStageCommand(item, `${label}.commands[${i}]`),
    );
    const seen = new Set<string>();
    for (const cmd of commands) {
      if (seen.has(cmd.id)) {
        throw new Error(`${label}: duplicate command id "${cmd.id}"`);
      }
      seen.add(cmd.id);
    }
    stage.commands = commands;
  }

  return stage;
}

function parseStageCommand(raw: unknown, label: string): StageCommand {
  const obj = requireRecord(raw, label);
  const name = requireString(obj.name, `${label}.name`);
  const id = obj.id === undefined ? name : requireString(obj.id, `${label}.id`);
  const command = requireCommand(obj.command, `${label}.command`);
  assertCommandArgvShape(command, label);

  const cmd: StageCommand = { id, name, command };
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
