import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { EvolvingConfig, GateCommand, VerifySuite, WorkflowStep } from "./types.ts";

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

  const workflow = requireArray(raw.workflow, `${source}: workflow`);
  const gates = requireRecord(raw.gates, `${source}: gates`);
  const prepare =
    gates.prepare === undefined
      ? []
      : requireArray(gates.prepare, `${source}: gates.prepare`).map((item, i) =>
          parseGateCommand(item, `${source}: gates.prepare[${i}]`),
        );
  const check = requireArray(gates.check, `${source}: gates.check`).map((item, i) =>
    parseGateCommand(item, `${source}: gates.check[${i}]`),
  );
  const verifyRaw = requireRecord(gates.verify, `${source}: gates.verify`);
  if (verifyRaw.detect !== "git") {
    throw new Error(`${source}: gates.verify.detect must be "git"`);
  }
  const suitesRaw = requireRecord(verifyRaw.suites, `${source}: gates.verify.suites`);
  const suites: Record<string, VerifySuite> = {};
  for (const [id, value] of Object.entries(suitesRaw)) {
    suites[id] = parseSuite(value, `${source}: gates.verify.suites.${id}`);
  }
  const always = verifyRaw.always === undefined
    ? []
    : requireArray(verifyRaw.always, `${source}: gates.verify.always`).map((item, i) =>
        parseGateCommand(item, `${source}: gates.verify.always[${i}]`),
      );

  return {
    version: 1,
    workflow: workflow.map((item, i) => parseWorkflowStep(item, `${source}: workflow[${i}]`)),
    gates: {
      prepare,
      check,
      verify: { detect: "git", suites, always },
    },
  };
}

function parseWorkflowStep(raw: unknown, label: string): WorkflowStep {
  const obj = requireRecord(raw, label);
  const id = requireString(obj.id, `${label}.id`);
  const kind = obj.kind;
  if (kind !== "guidance" && kind !== "run") {
    throw new Error(`${label}.kind must be "guidance" or "run"`);
  }
  const step: WorkflowStep = { id, kind };
  if (obj.summary !== undefined) step.summary = requireString(obj.summary, `${label}.summary`);
  if (obj.skip_when !== undefined) {
    step.skip_when = requireString(obj.skip_when, `${label}.skip_when`);
  }
  if (obj.refs !== undefined) {
    step.refs = requireArray(obj.refs, `${label}.refs`).map((r, i) =>
      requireString(r, `${label}.refs[${i}]`),
    );
  }
  if (obj.env !== undefined) step.env = requireStringRecord(obj.env, `${label}.env`);
  if (kind === "run") {
    step.command = requireCommand(obj.command, `${label}.command`);
  } else if (obj.command !== undefined) {
    throw new Error(`${label}: guidance steps must not set command`);
  }
  return step;
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
