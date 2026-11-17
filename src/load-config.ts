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
  VerifyStage,
  VerifySuite,
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
  if (raw.version === 1) {
    throw new Error(`${source}: version 1 is not supported; use version: 2 (stages + after_edit)`);
  }
  if (raw.version !== 2) throw new Error(`${source}: version must be 2`);

  const after_edit = parseAfterEdit(raw.after_edit, `${source}: after_edit`);
  const stagesRaw = requireArray(raw.stages, `${source}: stages`);
  if (stagesRaw.length === 0) throw new Error(`${source}: stages must be non-empty`);

  const stages = stagesRaw.map((item, i) => parseStage(item, `${source}: stages[${i}]`));
  assertStageUniqueness(stages, source);

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
  forbidKeys(obj, label, ["command", "steps", "check", "detect", "suites", "always", "env"]);
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
  forbidKeys(obj, label, [
    "command",
    "summary",
    "refs",
    "skip_when",
    "check",
    "detect",
    "suites",
    "always",
  ]);
  const steps = requireArray(obj.steps, `${label}.steps`).map((item, i) =>
    parseGateCommand(item, `${label}.steps[${i}]`),
  );
  return { id, kind: "prepare", steps };
}

function parseVerifyStage(obj: Record<string, unknown>, id: string, label: string): VerifyStage {
  forbidKeys(obj, label, ["command", "steps", "summary", "refs", "skip_when", "env"]);
  if (obj.detect !== "git") {
    throw new Error(`${label}.detect must be "git"`);
  }
  const check = requireArray(obj.check, `${label}.check`).map((item, i) =>
    parseGateCommand(item, `${label}.check[${i}]`),
  );
  const suitesRaw = requireRecord(obj.suites, `${label}.suites`);
  const suites: Record<string, VerifySuite> = {};
  for (const [suiteId, value] of Object.entries(suitesRaw)) {
    suites[suiteId] = parseSuite(value, `${label}.suites.${suiteId}`);
  }
  const always =
    obj.always === undefined
      ? []
      : requireArray(obj.always, `${label}.always`).map((item, i) =>
          parseGateCommand(item, `${label}.always[${i}]`),
        );
  return { id, kind: "verify", check, detect: "git", suites, always };
}

function parseRunStage(obj: Record<string, unknown>, id: string, label: string): RunStage {
  forbidKeys(obj, label, [
    "steps",
    "summary",
    "refs",
    "skip_when",
    "check",
    "detect",
    "suites",
    "always",
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

function parseSuite(raw: unknown, label: string): VerifySuite {
  const obj = requireRecord(raw, label);
  const suite: VerifySuite = {
    paths: requireArray(obj.paths, `${label}.paths`).map((p, i) =>
      requireString(p, `${label}.paths[${i}]`),
    ),
  };
  if (obj.command !== undefined) {
    suite.command = requireCommand(obj.command, `${label}.command`);
  }
  if (obj.also !== undefined) {
    suite.also = requireArray(obj.also, `${label}.also`).map((a, i) =>
      requireString(a, `${label}.also[${i}]`),
    );
  }
  if (suite.command === undefined && (suite.also === undefined || suite.also.length === 0)) {
    throw new Error(`${label}: set command and/or also`);
  }
  if (obj.env !== undefined) suite.env = requireStringRecord(obj.env, `${label}.env`);
  if (obj.name !== undefined) suite.name = requireString(obj.name, `${label}.name`);
  return suite;
}

function parseGateCommand(raw: unknown, label: string): GateCommand {
  const obj = requireRecord(raw, label);
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
    cmd.fix = requireCommand(obj.fix, `${label}.fix`);
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
