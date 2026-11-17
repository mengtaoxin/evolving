import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { parseConfig } from "../src/load-config.ts";
import { prepareCommands, verifyCommands, verifyStage } from "../src/stages-access.ts";

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
    expect(prepareCommands(config).map((s) => s.name)).toEqual(["format", "lint:fix"]);
    const cmds = verifyCommands(config);
    expect(cmds.map((c) => c.id)).toEqual([
      "format:check",
      "lint",
      "type-check",
      "test:lib",
      "test:app",
      "test:shared",
      "deps",
      "test:e2e",
    ]);
    expect(cmds.find((c) => c.id === "deps")?.command).toEqual([
      "command://test:lib",
      "command://test:app",
    ]);
    expect(cmds.find((c) => c.id === "test:lib")?.run_in_file_change).toEqual(["packages/lib/"]);
    expect(cmds.find((c) => c.id === "format:check")?.run_in_file_change).toBeUndefined();
    expect(verifyStage(config).commands.length).toBe(8);
  });

  it("defaults id to name", () => {
    const config = parseConfig({
      version: 2,
      after_edit: ["prepare", "verify"],
      stages: [
        {
          id: "verify",
          kind: "verify",
          commands: [{ name: "lint", command: ["true"] }],
        },
      ],
    });
    expect(verifyCommands(config)[0]?.id).toBe("lint");
  });

  it("allows omitting prepare stage (empty prepare)", () => {
    const config = parseConfig({
      version: 2,
      after_edit: ["prepare", "verify"],
      stages: [
        {
          id: "verify",
          kind: "verify",
          commands: [{ name: "ok", command: ["true"] }],
        },
      ],
    });
    expect(prepareCommands(config)).toEqual([]);
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

  it("rejects removed check/suites/detect/always/fix/steps", () => {
    expect(() =>
      parseConfig({
        version: 2,
        after_edit: ["prepare", "verify"],
        stages: [
          {
            id: "verify",
            kind: "verify",
            check: [],
            detect: "git",
            suites: {},
            commands: [{ name: "ok", command: ["true"] }],
          },
        ],
      }),
    ).toThrow(/check was removed/);

    expect(() =>
      parseConfig({
        version: 2,
        after_edit: ["prepare", "verify"],
        stages: [
          {
            id: "prepare",
            kind: "prepare",
            steps: [{ command: ["true"] }],
          },
          {
            id: "verify",
            kind: "verify",
            commands: [{ name: "ok", command: ["true"] }],
          },
        ],
      }),
    ).toThrow(/steps was renamed/);

    expect(() =>
      parseConfig({
        version: 2,
        after_edit: ["prepare", "verify"],
        stages: [
          {
            id: "verify",
            kind: "verify",
            commands: [{ name: "ok", command: ["true"], fix: ["true"] }],
          },
        ],
      }),
    ).toThrow(/fix/);
  });

  it("rejects mixed argv and command:// refs", () => {
    expect(() =>
      parseConfig({
        version: 2,
        after_edit: ["prepare", "verify"],
        stages: [
          {
            id: "verify",
            kind: "verify",
            commands: [
              {
                name: "bad",
                command: ["npm", "command://lint"],
              },
            ],
          },
        ],
      }),
    ).toThrow(/mix of argv/);
  });

  it("rejects unknown command:// refs", () => {
    expect(() =>
      parseConfig({
        version: 2,
        after_edit: ["prepare", "verify"],
        stages: [
          {
            id: "verify",
            kind: "verify",
            commands: [
              {
                name: "deps",
                command: ["command://missing"],
                run_in_file_change: ["package.json"],
              },
            ],
          },
        ],
      }),
    ).toThrow(/unknown command:\/\/missing/);
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
            commands: [{ name: "ok", command: ["true"] }],
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
            commands: [{ name: "ok", command: ["true"] }],
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
