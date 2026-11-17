import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { parseConfig } from "../src/load-config.ts";
import {
  findStage,
  isAgentStage,
  isMachineStage,
  stageCommands,
  stageHasTag,
  stagesWithTag,
} from "../src/stages-access.ts";

const fixtureDir = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(fixtureDir, "fixtures/minimal.evolving.yml");

describe("parseConfig", () => {
  it("loads the abstract fixture", () => {
    const config = parseConfig(parseYaml(readFileSync(fixturePath, "utf8")));
    expect(config.version).toBe(2);
    expect(config.stages.map((s) => s.id)).toEqual([
      "orient",
      "edit",
      "prepare",
      "verify",
      "docs",
    ]);
    expect(isAgentStage(findStage(config, "orient")!)).toBe(true);
    expect(isAgentStage(findStage(config, "edit")!)).toBe(true);
    expect(findStage(config, "edit")!.tags).toEqual(["needs-agent"]);
    expect(stageHasTag(findStage(config, "edit")!, "needs-agent")).toBe(true);
    expect(stagesWithTag(config, "needs-agent").map((s) => s.id)).toEqual(["edit"]);
    expect(findStage(config, "orient")!.tags).toBeUndefined();
    expect(isMachineStage(findStage(config, "prepare")!)).toBe(true);
    expect(stageCommands(findStage(config, "prepare")!).map((s) => s.name)).toEqual([
      "format",
      "lint:fix",
    ]);
    const cmds = stageCommands(findStage(config, "verify")!);
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
  });

  it("defaults id to name", () => {
    const config = parseConfig({
      version: 2,
      stages: [
        {
          id: "verify",
          commands: [{ name: "lint", command: ["true"] }],
        },
      ],
    });
    expect(stageCommands(findStage(config, "verify")!)[0]?.id).toBe("lint");
  });

  it("allows agent-only configs with no machine stages", () => {
    const config = parseConfig({
      version: 2,
      stages: [{ id: "orient", summary: "read docs" }],
    });
    expect(config.stages).toHaveLength(1);
    expect(isAgentStage(config.stages[0]!)).toBe(true);
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

  it("rejects removed after_edit and kind", () => {
    expect(() =>
      parseConfig({
        version: 2,
        after_edit: ["prepare", "verify"],
        stages: [{ id: "verify", commands: [{ name: "ok", command: ["true"] }] }],
      }),
    ).toThrow(/after_edit was removed/);

    expect(() =>
      parseConfig({
        version: 2,
        stages: [
          {
            id: "verify",
            kind: "verify",
            commands: [{ name: "ok", command: ["true"] }],
          },
        ],
      }),
    ).toThrow(/kind was removed/);
  });

  it("rejects empty commands array", () => {
    expect(() =>
      parseConfig({
        version: 2,
        stages: [{ id: "x", commands: [] }],
      }),
    ).toThrow(/commands must be non-empty/);
  });

  it("rejects mixed argv and command:// refs", () => {
    expect(() =>
      parseConfig({
        version: 2,
        stages: [
          {
            id: "verify",
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
        stages: [
          {
            id: "verify",
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

  it("rejects removed command key on agent stages", () => {
    expect(() =>
      parseConfig({
        version: 2,
        stages: [{ id: "x", command: ["true"] }],
      }),
    ).toThrow(/command was removed/);
  });

  it("parses optional tags and rejects empty or duplicate tags", () => {
    const config = parseConfig({
      version: 2,
      stages: [
        { id: "edit", tags: ["needs-agent", "review"] },
        { id: "orient", summary: "read" },
      ],
    });
    expect(config.stages[0]!.tags).toEqual(["needs-agent", "review"]);
    expect(stageHasTag(config.stages[1]!, "needs-agent")).toBe(false);

    expect(() =>
      parseConfig({
        version: 2,
        stages: [{ id: "edit", tags: [] }],
      }),
    ).toThrow(/tags must be non-empty/);

    expect(() =>
      parseConfig({
        version: 2,
        stages: [{ id: "edit", tags: ["needs-agent", "needs-agent"] }],
      }),
    ).toThrow(/duplicate tag/);

    expect(() =>
      parseConfig({
        version: 2,
        stages: [{ id: "edit", tags: [""] }],
      }),
    ).toThrow(/tags\[0\] must be a non-empty string/);
  });
});
