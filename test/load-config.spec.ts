import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { parseConfig } from "../src/load-config.ts";
import { checkSteps, prepareSteps, verifyStage } from "../src/stages-access.ts";

const fixtureDir = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(fixtureDir, "fixtures/minimal.evolving.yml");

describe("parseConfig", () => {
  it("loads the abstract fixture", () => {
    const config = parseConfig(parseYaml(readFileSync(fixturePath, "utf8")));
    expect(config.version).toBe(2);
    expect(config.after_edit).toEqual(["prepare", "verify"]);
    expect(config.stages.map((s) => s.id)).toEqual([
      "orient",
      "tests",
      "prepare",
      "verify",
      "docs",
    ]);
    expect(prepareSteps(config).map((s) => s.name)).toEqual(["format", "lint:fix"]);
    expect(checkSteps(config).map((s) => s.name)).toEqual([
      "format:check",
      "lint",
      "type-check",
    ]);
    expect(checkSteps(config)[0]?.fix).toEqual(["npm", "run", "format"]);
    expect(checkSteps(config)[1]?.fix).toEqual(["npm", "run", "lint:fix"]);
    const gate = verifyStage(config);
    expect(Object.keys(gate.suites)).toEqual(["lib", "app", "shared", "deps"]);
    expect(gate.suites.shared?.also).toEqual(["lib", "app"]);
    expect(gate.suites.deps?.command).toBeUndefined();
    expect(gate.always?.[0]?.name).toBe("test:e2e");
  });

  it("allows omitting prepare stage (empty prepare)", () => {
    const config = parseConfig({
      version: 2,
      after_edit: ["prepare", "verify"],
      stages: [
        {
          id: "verify",
          kind: "verify",
          check: [{ command: ["true"] }],
          detect: "git",
          suites: {},
        },
      ],
    });
    expect(prepareSteps(config)).toEqual([]);
  });

  it("rejects version 1", () => {
    expect(() =>
      parseConfig({
        version: 1,
        workflow: [],
        gates: { check: [], verify: { detect: "git", suites: {} } },
      }),
    ).toThrow(/version 1 is not supported/);
  });

  it("rejects guidance stages that set command", () => {
    expect(() =>
      parseConfig({
        version: 2,
        after_edit: ["prepare", "verify"],
        stages: [
          { id: "x", kind: "guidance", command: ["true"] },
          {
            id: "verify",
            kind: "verify",
            check: [{ command: ["true"] }],
            detect: "git",
            suites: {},
          },
        ],
      }),
    ).toThrow(/must not set command/);
  });

  it("requires run stages to have a command", () => {
    expect(() =>
      parseConfig({
        version: 2,
        after_edit: ["prepare", "verify"],
        stages: [
          { id: "x", kind: "run" },
          {
            id: "verify",
            kind: "verify",
            check: [{ command: ["true"] }],
            detect: "git",
            suites: {},
          },
        ],
      }),
    ).toThrow(/command/);
  });

  it("requires exactly one verify stage", () => {
    expect(() =>
      parseConfig({
        version: 2,
        after_edit: ["prepare", "verify"],
        stages: [{ id: "orient", kind: "guidance" }],
      }),
    ).toThrow(/exactly one kind: verify/);
  });
});
