import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, parseConfig } from "../src/load-config.ts";
import { verifyCommands } from "../src/stages-access.ts";
import { runVerify } from "../src/verify.ts";
import { minimalV2Yaml } from "./helpers/v2-yaml.ts";

const MISSING_BIN = "evolving-not-installed-bin-9f3a2c";

function writeVerifyConfig(dir: string, verifyCommandsYaml: string): void {
  writeFileSync(join(dir, "evolving.yml"), minimalV2Yaml({ verifyCommandsYaml }));
}

async function captureVerify(dir: string) {
  const originalLog = console.log;
  console.log = () => {};
  try {
    return await runVerify(dir, loadConfig(dir), []);
  } finally {
    console.log = originalLog;
  }
}

describe("onMissing: warn", () => {
  it("parses onMissing warn on a verify command", () => {
    const config = parseConfig({
      version: 2,
      after_edit: ["prepare", "verify"],
      stages: [
        {
          id: "verify",
          kind: "verify",
          commands: [
            { name: "gitleaks", command: ["gitleaks", "detect"], onMissing: "warn" },
          ],
        },
      ],
    });
    expect(verifyCommands(config)[0]?.onMissing).toBe("warn");
  });

  it("rejects unknown onMissing values", () => {
    expect(() =>
      parseConfig({
        version: 2,
        after_edit: ["prepare", "verify"],
        stages: [
          {
            id: "verify",
            kind: "verify",
            commands: [{ name: "ok", command: ["true"], onMissing: "skip" }],
          },
        ],
      }),
    ).toThrow(/onMissing/);
  });

  it("warns and passes verify when the executable is missing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-on-missing-"));
    writeVerifyConfig(
      dir,
      `      - name: secrets
        command: ["${MISSING_BIN}"]
        onMissing: warn
`,
    );
    const report = await captureVerify(dir);
    expect(report.exit_code).toBe(0);
    expect(report.ok).toBe(true);
    expect(report.failed).toEqual([]);
    expect(report.steps[0]?.missing_executable).toBe(true);
    expect(report.steps[0]?.ok).toBe(true);
  });

  it("still fails verify when a missing executable has no onMissing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-on-missing-fail-"));
    writeVerifyConfig(
      dir,
      `      - name: secrets
        command: ["${MISSING_BIN}"]
`,
    );
    const report = await captureVerify(dir);
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
    const report = await captureVerify(dir);
    expect(report.exit_code).toBe(1);
    expect(report.failed).toContain("secrets");
  });
});
