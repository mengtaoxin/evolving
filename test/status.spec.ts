import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCheck } from "../src/check.ts";
import { loadConfig } from "../src/load-config.ts";
import { buildStatus, printStatus } from "../src/status.ts";

describe("status", () => {
  it("returns state none when no last-run exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-status-none-"));
    const status = buildStatus(dir);
    expect(status).toEqual({
      evolving: 1,
      command: "status",
      state: "none",
      ok: null,
      next: ["explain"],
    });
  });

  it("suggests prepare then check when a fix companion failed", async () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-status-fix-"));
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
    - name: lint
      command: ["node", "-e", "process.exit(1)"]
      fix: ["npm", "run", "lint:fix"]
  verify:
    detect: git
    suites: {}
`,
    );
    const original = console.log;
    console.log = () => {};
    try {
      await runCheck(dir, loadConfig(dir), { mode: "json" });
    } finally {
      console.log = original;
    }
    const status = buildStatus(dir);
    expect(status.state).toBe("failed");
    expect(status.next).toEqual(["prepare", "check"]);
  });

  it("printStatus --json emits one JSON object", () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-status-print-"));
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    try {
      printStatus(dir, true);
    } finally {
      console.log = original;
    }
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] as string).state).toBe("none");
  });
});
