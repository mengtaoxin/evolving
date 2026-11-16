import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/load-config.ts";
import { runPrepare } from "../src/prepare.ts";

describe("runPrepare", () => {
  it("runs gates.prepare commands and returns 0 on success", async () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-prepare-"));
    writeFileSync(
      join(dir, "evolving.yml"),
      `
version: 1
workflow:
  - id: verify
    kind: run
    command: ["true"]
gates:
  prepare:
    - name: touch
      command: ["node", "-e", "require('node:fs').writeFileSync('prepared.txt','ok')"]
  check:
    - command: ["true"]
  verify:
    detect: git
    suites: {}
`,
    );
    const config = loadConfig(dir);
    const report = await runPrepare(dir, config);
    expect(report.exit_code).toBe(0);
    expect(await import("node:fs").then((fs) => fs.readFileSync(join(dir, "prepared.txt"), "utf8"))).toBe(
      "ok",
    );
  });

  it("exits 0 with a skip message when prepare is empty", async () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-prepare-empty-"));
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
    - command: ["true"]
  verify:
    detect: git
    suites: {}
`,
    );
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    try {
      const report = await runPrepare(dir, loadConfig(dir));
      expect(report.exit_code).toBe(0);
    } finally {
      console.log = original;
    }
    expect(lines.join("\n")).toMatch(/prepare: no steps/);
  });
});
