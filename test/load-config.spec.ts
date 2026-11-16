import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { parseConfig } from "../src/load-config.ts";

const fixtureDir = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(fixtureDir, "fixtures/minimal.evolving.yml");

describe("parseConfig", () => {
  it("loads the abstract fixture", () => {
    const config = parseConfig(parseYaml(readFileSync(fixturePath, "utf8")));
    expect(config.version).toBe(1);
    expect(config.workflow.map((s) => s.id)).toEqual(["orient", "tests", "verify", "docs"]);
    expect(config.gates.check.map((s) => s.name)).toEqual([
      "format:check",
      "lint",
      "type-check",
    ]);
    expect(Object.keys(config.gates.verify.suites)).toEqual(["lib", "app", "shared", "deps"]);
    expect(config.gates.verify.suites.shared?.also).toEqual(["lib", "app"]);
    expect(config.gates.verify.suites.deps?.command).toBeUndefined();
    expect(config.gates.verify.always?.[0]?.name).toBe("test:e2e");
  });


  it("rejects guidance steps that set command", () => {
    expect(() =>
      parseConfig({
        version: 1,
        workflow: [{ id: "x", kind: "guidance", command: ["true"] }],
        gates: {
          check: [{ command: ["true"] }],
          verify: { detect: "git", suites: {} },
        },
      }),
    ).toThrow(/guidance steps must not set command/);
  });

  it("requires run steps to have a command", () => {
    expect(() =>
      parseConfig({
        version: 1,
        workflow: [{ id: "x", kind: "run" }],
        gates: {
          check: [{ command: ["true"] }],
          verify: { detect: "git", suites: {} },
        },
      }),
    ).toThrow(/command/);
  });
});
