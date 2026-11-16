import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCheck } from "../src/check.ts";
import { loadConfig } from "../src/load-config.ts";

describe("check fix hint", () => {
  it("prints the fix companion when a check step fails", async () => {
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
    const lines: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    try {
      const code = await runCheck(dir, loadConfig(dir));
      expect(code).toBe(1);
    } finally {
      console.log = originalLog;
    }
    expect(lines.join("\n")).toContain("fix: npm run format");
  });
});
