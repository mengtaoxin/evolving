import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCheck } from "../src/check.ts";
import { loadConfig } from "../src/load-config.ts";

describe("check fix hint", () => {
  it("includes the fix companion on failed check steps in JSON", async () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-check-fix-"));
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
    - name: format:check
      command: ["node", "-e", "process.exit(1)"]
      fix: ["npm", "run", "format"]
  verify:
    detect: git
    suites: {}
`,
    );
    const originalLog = console.log;
    console.log = () => {};
    let report;
    try {
      report = await runCheck(dir, loadConfig(dir));
    } finally {
      console.log = originalLog;
    }
    expect(report.exit_code).toBe(1);
    expect(report.failure[0]?.fix).toEqual(["npm", "run", "format"]);
    expect(report.steps[0]?.fix).toEqual(["npm", "run", "format"]);
  });
});
