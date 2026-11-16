import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCheck } from "../src/check.ts";
import { lastRunPath } from "../src/last-run.ts";
import { loadConfig } from "../src/load-config.ts";
import { runPrepare } from "../src/prepare.ts";
import { buildStatus } from "../src/status.ts";

function writeMinimal(dir: string, checkYaml: string, prepareYaml = ""): void {
  writeFileSync(
    join(dir, "evolving.yml"),
    `
version: 1
workflow:
  - id: prepare
    kind: run
    command: ["npx", "evolving", "prepare"]
  - id: verify
    kind: run
    command: ["true"]
gates:
${prepareYaml}
  check:
${checkYaml}
  verify:
    detect: git
    suites: {}
`,
  );
}

describe("json RunReport", () => {
  it("returns structured JSON fields and writes last-run on prepare", async () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-json-prepare-"));
    writeMinimal(
      dir,
      `    - command: ["true"]
`,
      `  prepare:
    - name: touch
      command: ["node", "-e", "require('node:fs').writeFileSync('ok.txt','1')"]
`,
    );
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    let report;
    try {
      report = await runPrepare(dir, loadConfig(dir), { mode: "json" });
    } finally {
      console.log = original;
    }
    expect(report.evolving).toBe(1);
    expect(report.command).toBe("prepare");
    expect(report.ok).toBe(true);
    expect(report.exit_code).toBe(0);
    expect(report.steps[0]?.name).toBe("touch");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] as string).command).toBe("prepare");
    const saved = JSON.parse(readFileSync(lastRunPath(dir), "utf8"));
    expect(saved.finished_at).toBeTruthy();
    expect(saved.cwd).toBe(dir);
  });

  it("includes fix on failed check steps in json mode", async () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-json-fix-"));
    writeMinimal(
      dir,
      `    - name: format:check
      command: ["node", "-e", "process.exit(1)"]
      fix: ["npm", "run", "format"]
`,
    );
    const original = console.log;
    console.log = () => {};
    let report;
    try {
      report = await runCheck(dir, loadConfig(dir), { mode: "json" });
    } finally {
      console.log = original;
    }
    expect(report.ok).toBe(false);
    expect(report.failed).toContain("format:check");
    expect(report.steps[0]?.fix).toEqual(["npm", "run", "format"]);
    expect(report.steps[0]?.log).toMatch(/\/tmp\/evolving-format-check-/);

    const status = buildStatus(dir);
    expect(status.state).toBe("failed");
    expect(status.next[0]).toBe("prepare");
  });
});
