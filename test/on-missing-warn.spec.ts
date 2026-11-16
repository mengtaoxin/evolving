import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCheck } from "../src/check.ts";
import { loadConfig, parseConfig } from "../src/load-config.ts";

const MISSING_BIN = "evolving-not-installed-bin-9f3a2c";

function writeCheckConfig(
  dir: string,
  checkYaml: string,
): void {
  writeFileSync(
    join(dir, "evolving.yml"),
    `
version: 1
workflow:
  - id: verify
    kind: run
    command: ["true"]
gates:
  check:
${checkYaml}
  verify:
    detect: git
    suites: {}
`,
  );
}

async function captureCheck(dir: string): Promise<{ code: number; lines: string[] }> {
  const lines: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  try {
    const report = await runCheck(dir, loadConfig(dir));
    return { code: report.exit_code, lines };
  } finally {
    console.log = originalLog;
  }
}

describe("onMissing: warn", () => {
  it("parses onMissing warn on a gate command", () => {
    const config = parseConfig({
      version: 1,
      workflow: [{ id: "verify", kind: "run", command: ["true"] }],
      gates: {
        check: [{ name: "gitleaks", command: ["gitleaks", "detect"], onMissing: "warn" }],
        verify: { detect: "git", suites: {} },
      },
    });
    expect(config.gates.check[0]?.onMissing).toBe("warn");
  });

  it("rejects unknown onMissing values", () => {
    expect(() =>
      parseConfig({
        version: 1,
        workflow: [{ id: "verify", kind: "run", command: ["true"] }],
        gates: {
          check: [{ command: ["true"], onMissing: "skip" }],
          verify: { detect: "git", suites: {} },
        },
      }),
    ).toThrow(/onMissing/);
  });

  it("warns and passes check when the executable is missing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-on-missing-"));
    writeCheckConfig(
      dir,
      `    - name: secrets
      command: ["${MISSING_BIN}"]
      onMissing: warn
`,
    );
    const { code, lines } = await captureCheck(dir);
    const text = lines.join("\n");
    expect(code).toBe(0);
    expect(text).toMatch(/⚠.*secrets/);
    expect(text).toMatch(/not installed|missing|install/i);
    expect(text).toContain("✔ check passed");
    expect(text).not.toContain("✘ secrets");
  });

  it("still fails check when a missing executable has no onMissing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-on-missing-fail-"));
    writeCheckConfig(
      dir,
      `    - name: secrets
      command: ["${MISSING_BIN}"]
`,
    );
    const { code, lines } = await captureCheck(dir);
    const text = lines.join("\n");
    expect(code).toBe(1);
    expect(text).toContain("✘ secrets");
    expect(text).toContain("✘ check failed");
  });

  it("still fails when the tool is installed but reports findings", async () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-on-missing-findings-"));
    writeCheckConfig(
      dir,
      `    - name: secrets
      command: ["node", "-e", "process.exit(1)"]
      onMissing: warn
`,
    );
    const { code, lines } = await captureCheck(dir);
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("✘ secrets");
  });
});
