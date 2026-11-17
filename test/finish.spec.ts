import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runFinish } from "../src/finish.ts";
import { loadConfig } from "../src/load-config.ts";
import { machineStageYaml, minimalV2Yaml } from "./helpers/v2-yaml.ts";

async function captureFinish(dir: string) {
  const originalLog = console.log;
  console.log = () => {};
  try {
    return await runFinish(dir, loadConfig(dir));
  } finally {
    console.log = originalLog;
  }
}

describe("runFinish", () => {
  it("runs commands on machine stages tagged run-in-finish", async () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-finish-tag-"));
    writeFileSync(
      join(dir, "evolving.yml"),
      minimalV2Yaml({
        stagesYaml: machineStageYaml(
          "prepare",
          `      - name: touch
        command: ["node", "-e", "require('node:fs').writeFileSync('finished.txt','ok')"]`,
          { tags: ["run-in-finish"] },
        ),
      }),
    );
    const report = await captureFinish(dir);
    expect(report.exit_code).toBe(0);
    expect(report.command).toBe("finish");
    expect(report.ok).toBe(true);
    expect(report.steps.map((s) => s.name)).toEqual(["touch"]);
    expect(
      await import("node:fs").then((fs) => fs.readFileSync(join(dir, "finished.txt"), "utf8")),
    ).toBe("ok");
  });

  it("skips machine stages without run-in-finish", async () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-finish-skip-"));
    writeFileSync(
      join(dir, "evolving.yml"),
      minimalV2Yaml({
        stagesYaml: [
          machineStageYaml(
            "local-only",
            `      - name: touch
        command: ["node", "-e", "require('node:fs').writeFileSync('skipped.txt','no')"]`,
          ),
          machineStageYaml(
            "gate",
            `      - name: ok
        command: ["true"]`,
            { tags: ["run-in-finish"] },
          ),
        ].join("\n"),
      }),
    );
    const report = await captureFinish(dir);
    expect(report.exit_code).toBe(0);
    expect(report.steps.map((s) => s.name)).toEqual(["ok"]);
    expect(existsSync(join(dir, "skipped.txt"))).toBe(false);
  });

  it("succeeds with empty steps when no stage is tagged run-in-finish", async () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-finish-empty-"));
    writeFileSync(
      join(dir, "evolving.yml"),
      minimalV2Yaml({
        stagesYaml: machineStageYaml(
          "local-only",
          `      - name: touch
        command: ["node", "-e", "require('node:fs').writeFileSync('skipped.txt','no')"]`,
        ),
      }),
    );
    const report = await captureFinish(dir);
    expect(report.exit_code).toBe(0);
    expect(report.ok).toBe(true);
    expect(report.steps).toEqual([]);
    expect(existsSync(join(dir, "skipped.txt"))).toBe(false);
  });
});
