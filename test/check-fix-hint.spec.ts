import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCheck } from "../src/check.ts";
import { loadConfig } from "../src/load-config.ts";
import { minimalV2Yaml } from "./helpers/v2-yaml.ts";

describe("check fix hint", () => {
  it("includes the fix companion on failed check steps in JSON", async () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-check-fix-"));
    writeFileSync(
      join(dir, "evolving.yml"),
      minimalV2Yaml({
        checkYaml: `      - name: format:check
        command: ["node", "-e", "process.exit(1)"]
        fix: ["npm", "run", "format"]`,
      }),
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
