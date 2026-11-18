import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lastRunPath, logsDir } from "../src/last-run.ts";
import { loadConfig } from "../src/load-config.ts";
import { MAX_LOG_BYTES, outputPreview, writeStepLog } from "../src/report.ts";
import { runStage } from "../src/run-stage.ts";
import { buildStatus } from "../src/status.ts";
import { agentStageYaml, machineStageYaml, minimalYaml } from "./helpers/yaml.ts";

function writeConfig(dir: string, stagesYaml: string): void {
  writeFileSync(join(dir, "evolving.yml"), minimalYaml({ stagesYaml }));
}

describe("json RunReport", () => {
  it("returns structured JSON fields and writes last-run + success log on run", async () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-json-run-"));
    writeConfig(
      dir,
      machineStageYaml(
        "prepare",
        `      - name: touch
        command: ["node", "-e", "require('node:fs').writeFileSync('ok.txt','1')"]
`,
      ),
    );
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    let report;
    try {
      report = await runStage(dir, loadConfig(dir), "prepare");
    } finally {
      console.log = original;
    }
    expect(report.evolving).toBe(1);
    expect(report.command).toBe("run");
    expect(report.stage_id).toBe("prepare");
    expect(report.ok).toBe(true);
    expect(report.exit_code).toBe(0);
    expect(report.steps[0]?.name).toBe("touch");
    expect(report.steps[0]?.log?.startsWith(logsDir(dir) + "/")).toBe(true);
    expect(report.steps[0]?.log?.endsWith("-touch.log")).toBe(true);
    expect(existsSync(report.steps[0]!.log!)).toBe(true);
    expect(report.last_run_path).toBe(lastRunPath(dir));
    expect(report.failure).toEqual([]);
    expect(lines).toHaveLength(1);
    const printed = JSON.parse(lines[0] as string);
    expect(printed.command).toBe("run");
    expect(printed.ok).toBe(true);
    expect(printed.steps).toBeUndefined();
    expect(printed.step_count).toBe(1);
    expect(printed.stage_id).toBe("prepare");
    expect(printed.last_run_path).toBe(lastRunPath(dir));
    const saved = JSON.parse(readFileSync(lastRunPath(dir), "utf8"));
    expect(saved.finished_at).toBeTruthy();
    expect(saved.cwd).toBe(dir);
    expect(saved.steps[0]?.name).toBe("touch");
    expect(saved.steps[0]?.log).toBe(report.steps[0]?.log);
    expect(saved.last_run_path).toBe(lastRunPath(dir));
  });

  it("includes .evolving/logs path on failed steps and resumes to edit", async () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-json-fail-"));
    writeConfig(
      dir,
      [
        agentStageYaml("edit", { summary: "change code" }),
        machineStageYaml(
          "verify",
          `      - name: format:check
        command: ["node", "-e", "console.error('Error: boom'); process.exit(1)"]
`,
        ),
      ].join("\n"),
    );
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    let report;
    try {
      report = await runStage(dir, loadConfig(dir), "verify", []);
    } finally {
      console.log = original;
    }
    expect(report.ok).toBe(false);
    expect(report.failed).toContain("format:check");
    expect(report.failure[0]?.name).toBe("format:check");
    expect(report.failure[0]?.log?.startsWith(logsDir(dir) + "/")).toBe(true);
    expect(report.failure[0]?.log?.endsWith("-format-check.log")).toBe(true);
    expect(existsSync(report.failure[0]!.log!)).toBe(true);
    expect(readFileSync(report.failure[0]!.log!, "utf8")).toContain("Error: boom");
    expect(report.last_run_path).toBe(lastRunPath(dir));
    expect(report.steps[0]?.log).toBe(report.failure[0]?.log);
    expect(report.steps[0]?.output_preview).toMatch(/Error/);

    const printed = JSON.parse(lines[0] as string);
    expect(printed.last_run_path).toBe(lastRunPath(dir));

    const status = buildStatus(dir);
    expect(status.state).toBe("failed");
    expect(status.next).toEqual([
      "Read evolving.yml for the current step (edit)",
      "evolving run verify",
    ]);
    expect(status.last_run).toBeUndefined();
    expect(status.failure?.[0]?.name).toBe("format:check");
    expect(status.failure?.[0]?.log).toBe(report.failure[0]?.log);
  });

  it("outputPreview prefers Error window then last N lines", () => {
    const noise = Array.from({ length: 60 }, (_, i) => `noise ${i}`);
    const withError = [...noise.slice(0, 50), "Error: real failure", ...noise.slice(50)].join(
      "\n",
    );
    const preview = outputPreview(withError, 10);
    expect(preview).toContain("Error: real failure");
    expect(preview).toMatch(/earlier lines|more lines/);

    const noError = noise.join("\n");
    const endWindow = outputPreview(noError, 10);
    expect(endWindow).toContain("noise 59");
    expect(endWindow).toContain("earlier lines");
    expect(endWindow).not.toContain("noise 0");
  });

  it("writeStepLog truncates oversized output with a marker", () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-log-cap-"));
    const huge = "x".repeat(MAX_LOG_BYTES + 50_000);
    const path = writeStepLog(dir, "big", "20260101-000000", huge);
    const body = readFileSync(path, "utf8");
    expect(body.slice(0, MAX_LOG_BYTES)).toBe(huge.slice(0, MAX_LOG_BYTES));
    expect(body).toContain("[evolving] log truncated");
    expect(body).toContain(String(MAX_LOG_BYTES));
    expect(body.length).toBeLessThan(huge.length);
  });
});
