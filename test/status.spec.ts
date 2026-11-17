import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lastRunPath, writeLastRun } from "../src/last-run.ts";
import { loadConfig } from "../src/load-config.ts";
import { runStage } from "../src/run-stage.ts";
import { buildStatus, printStatus } from "../src/status.ts";
import type { RunReport } from "../src/types.ts";
import { agentStageYaml, machineStageYaml, minimalYaml } from "./helpers/yaml.ts";

describe("status", () => {
  it("returns state none when no last-run exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-status-none-"));
    const status = buildStatus(dir);
    expect(status).toEqual({
      evolving: 1,
      command: "status",
      state: "none",
      ok: null,
      next: ["explain"],
    });
  });

  it("suggests nearest prior agent stage on failure", async () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-status-agent-fail-"));
    writeFileSync(
      join(dir, "evolving.yml"),
      minimalYaml({
        stagesYaml: [
          agentStageYaml("edit", { summary: "change code" }),
          machineStageYaml(
            "verify",
            `      - name: lint
        command: ["node", "-e", "process.exit(1)"]`,
          ),
        ].join("\n"),
      }),
    );
    const original = console.log;
    console.log = () => {};
    try {
      await runStage(dir, loadConfig(dir), "verify", []);
    } finally {
      console.log = original;
    }
    const status = buildStatus(dir);
    expect(status.state).toBe("failed");
    expect(status.next).toEqual(["edit", "run verify"]);
    expect(status.last_run).toBeUndefined();
    expect(status.failure?.[0]?.name).toBe("lint");
    expect(status.last_run_path).toBe(lastRunPath(dir));
  });

  it("default omits last_run; --full embeds it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-status-full-"));
    writeFileSync(
      join(dir, "evolving.yml"),
      minimalYaml({
        stagesYaml: [
          agentStageYaml("edit"),
          machineStageYaml(
            "verify",
            `      - name: lint
        command: ["node", "-e", "process.exit(1)"]`,
          ),
        ].join("\n"),
      }),
    );
    const original = console.log;
    console.log = () => {};
    try {
      await runStage(dir, loadConfig(dir), "verify", []);
    } finally {
      console.log = original;
    }
    const slim = buildStatus(dir);
    expect(slim.last_run).toBeUndefined();
    expect(slim.failed).toContain("lint");

    const full = buildStatus(dir, { full: true });
    expect(full.last_run?.command).toBe("run");
    expect(full.last_run?.stage_id).toBe("verify");
    expect(full.last_run?.failed).toContain("lint");
  });

  it("resume uses stage_id and config when last-run is synthetic", () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-status-synth-"));
    writeFileSync(
      join(dir, "evolving.yml"),
      minimalYaml({
        stagesYaml: [
          agentStageYaml("orient"),
          agentStageYaml("edit"),
          machineStageYaml(
            "verify",
            `      - name: ok
        command: ["true"]`,
          ),
        ].join("\n"),
      }),
    );
    const report: RunReport = {
      evolving: 1,
      command: "run",
      ok: false,
      exit_code: 1,
      seconds: 1,
      stage_id: "verify",
      steps: [{ name: "lint", ok: false, code: 1, seconds: 0.2, log: "/tmp/x.log" }],
      failed: ["lint"],
      failure: [{ name: "lint", log: "/tmp/x.log" }],
    };
    writeLastRun(dir, report);
    const status = buildStatus(dir);
    expect(status.next).toEqual(["edit", "run verify"]);
  });

  it("printStatus emits one JSON object", () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-status-print-"));
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    try {
      printStatus(dir);
    } finally {
      console.log = original;
    }
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] as string).state).toBe("none");
  });
});
