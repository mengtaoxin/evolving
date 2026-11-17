import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCheck } from "../src/check.ts";
import { loadConfig, parseConfig } from "../src/load-config.ts";
import { checkSteps } from "../src/stages-access.ts";
import { minimalV2Yaml } from "./helpers/v2-yaml.ts";

const MISSING_BIN = "evolving-not-installed-bin-9f3a2c";

function writeCheckConfig(dir: string, checkYaml: string): void {
  writeFileSync(join(dir, "evolving.yml"), minimalV2Yaml({ checkYaml }));
}

async function captureCheck(dir: string) {
  const originalLog = console.log;
  console.log = () => {};
  try {
    return await runCheck(dir, loadConfig(dir));
  } finally {
    console.log = originalLog;
  }
}

describe("onMissing: warn", () => {
  it("parses onMissing warn on a gate command", () => {
    const config = parseConfig({
      version: 2,
      after_edit: ["prepare", "verify"],
      stages: [
        {
          id: "verify",
          kind: "verify",
          check: [{ name: "gitleaks", command: ["gitleaks", "detect"], onMissing: "warn" }],
          detect: "git",
          suites: {},
        },
      ],
    });
    expect(checkSteps(config)[0]?.onMissing).toBe("warn");
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
            check: [{ command: ["true"], onMissing: "skip" }],
            detect: "git",
            suites: {},
          },
        ],
      }),
    ).toThrow(/onMissing/);
  });

  it("warns and passes check when the executable is missing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-on-missing-"));
    writeCheckConfig(
      dir,
      `      - name: secrets
        command: ["${MISSING_BIN}"]
        onMissing: warn
`,
    );
    const report = await captureCheck(dir);
    expect(report.exit_code).toBe(0);
    expect(report.ok).toBe(true);
    expect(report.failed).toEqual([]);
    expect(report.steps[0]?.missing_executable).toBe(true);
    expect(report.steps[0]?.ok).toBe(true);
  });

  it("still fails check when a missing executable has no onMissing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-on-missing-fail-"));
    writeCheckConfig(
      dir,
      `      - name: secrets
        command: ["${MISSING_BIN}"]
`,
    );
    const report = await captureCheck(dir);
    expect(report.exit_code).toBe(1);
    expect(report.failed).toContain("secrets");
    expect(report.steps[0]?.missing_executable).toBe(true);
    expect(report.steps[0]?.ok).toBe(false);
  });

  it("still fails when the tool is installed but reports findings", async () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-on-missing-findings-"));
    writeCheckConfig(
      dir,
      `      - name: secrets
        command: ["node", "-e", "process.exit(1)"]
        onMissing: warn
`,
    );
    const report = await captureCheck(dir);
    expect(report.exit_code).toBe(1);
    expect(report.failed).toContain("secrets");
  });
});
