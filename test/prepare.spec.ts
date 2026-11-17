import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/load-config.ts";
import { runStage } from "../src/run-stage.ts";
import { agentStageYaml, machineStageYaml, minimalYaml } from "./helpers/yaml.ts";

describe("runStage", () => {
  it("runs machine stage commands and returns 0 on success", async () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-run-"));
    writeFileSync(
      join(dir, "evolving.yml"),
      minimalYaml({
        stagesYaml: machineStageYaml(
          "prepare",
          `      - name: touch
        command: ["node", "-e", "require('node:fs').writeFileSync('prepared.txt','ok')"]`,
        ),
      }),
    );
    const original = console.log;
    console.log = () => {};
    let report;
    try {
      report = await runStage(dir, loadConfig(dir), "prepare");
    } finally {
      console.log = original;
    }
    expect(report.exit_code).toBe(0);
    expect(report.command).toBe("run");
    expect(report.stage_id).toBe("prepare");
    expect(
      await import("node:fs").then((fs) => fs.readFileSync(join(dir, "prepared.txt"), "utf8")),
    ).toBe("ok");
  });

  it("agent stage returns ok with no commands to run", async () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-run-agent-"));
    writeFileSync(
      join(dir, "evolving.yml"),
      minimalYaml({
        stagesYaml: agentStageYaml("edit", { summary: "change code" }),
      }),
    );
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    let report;
    try {
      report = await runStage(dir, loadConfig(dir), "edit");
    } finally {
      console.log = original;
    }
    expect(report.exit_code).toBe(0);
    expect(report.ok).toBe(true);
    expect(report.stage_id).toBe("edit");
    expect(report.steps[0]?.output_preview).toMatch(/no commands to run/i);
    expect(JSON.parse(lines[0] as string).command).toBe("run");
  });
});
