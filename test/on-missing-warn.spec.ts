import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, parseConfig } from "../src/load-config.ts";
import { findStage, stageCommands } from "../src/stages-access.ts";
import { runStage } from "../src/run-stage.ts";
import { machineStageYaml, minimalV2Yaml } from "./helpers/v2-yaml.ts";

const MISSING_BIN = "evolving-not-installed-bin-9f3a2c";

function writeVerifyConfig(dir: string, commandsYaml: string): void {
  writeFileSync(
    join(dir, "evolving.yml"),
    minimalV2Yaml({ stagesYaml: machineStageYaml("verify", commandsYaml) }),
  );
}

async function captureRun(dir: string) {
  const originalLog = console.log;
  console.log = () => {};
  try {
    return await runStage(dir, loadConfig(dir), "verify", []);
  } finally {
    console.log = originalLog;
  }
}

describe("onMissing: warn", () => {
  it("parses onMissing warn on a stage command", () => {
    const config = parseConfig({
      version: 2,
      stages: [
        {
          id: "verify",
          commands: [
            { name: "gitleaks", command: ["gitleaks", "detect"], onMissing: "warn" },
          ],
        },
      ],
    });
    expect(stageCommands(findStage(config, "verify")!)[0]?.onMissing).toBe("warn");
  });

  it("rejects unknown onMissing values", () => {
    expect(() =>
      parseConfig({
        version: 2,
        stages: [
          {
            id: "verify",
            commands: [{ name: "ok", command: ["true"], onMissing: "skip" }],
          },
        ],
      }),
    ).toThrow(/onMissing/);
  });

  it("warns and passes when the executable is missing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-on-missing-"));
    writeVerifyConfig(
      dir,
      `      - name: secrets
        command: ["${MISSING_BIN}"]
        onMissing: warn
`,
    );
    const report = await captureRun(dir);
    expect(report.exit_code).toBe(0);
    expect(report.ok).toBe(true);
    expect(report.failed).toEqual([]);
    expect(report.steps[0]?.missing_executable).toBe(true);
    expect(report.steps[0]?.ok).toBe(true);
  });

  it("still fails when a missing executable has no onMissing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-on-missing-fail-"));
    writeVerifyConfig(
      dir,
      `      - name: secrets
        command: ["${MISSING_BIN}"]
`,
    );
    const report = await captureRun(dir);
    expect(report.exit_code).toBe(1);
    expect(report.failed).toContain("secrets");
    expect(report.steps[0]?.missing_executable).toBe(true);
    expect(report.steps[0]?.ok).toBe(false);
  });

  it("still fails when the tool is installed but reports findings", async () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-on-missing-findings-"));
    writeVerifyConfig(
      dir,
      `      - name: secrets
        command: ["node", "-e", "process.exit(1)"]
        onMissing: warn
`,
    );
    const report = await captureRun(dir);
    expect(report.exit_code).toBe(1);
    expect(report.failed).toContain("secrets");
  });
});
