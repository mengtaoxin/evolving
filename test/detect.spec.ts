import {
  pathMatches,
  resolveSelectedCommandIds,
  invalidCommandArgs,
  runnableSelectedIds,
} from "../src/detect.ts";
import type { VerifyStage } from "../src/types.ts";

const stage: VerifyStage = {
  id: "verify",
  kind: "verify",
  commands: [
    {
      id: "format:check",
      name: "format:check",
      command: ["npm", "run", "format:check"],
    },
    {
      id: "test:lib",
      name: "test:lib",
      command: ["npm", "run", "test:lib"],
      run_in_file_change: ["packages/lib/"],
    },
    {
      id: "test:app",
      name: "test:app",
      command: ["npm", "run", "test:app"],
      run_in_file_change: ["packages/app/"],
    },
    {
      id: "test:shared",
      name: "test:shared",
      command: ["npm", "run", "test:shared"],
      run_in_file_change: ["packages/shared/"],
    },
    {
      id: "deps",
      name: "deps",
      command: ["command://test:lib", "command://test:app"],
      run_in_file_change: ["package.json", "package-lock.json"],
    },
    {
      id: "test:e2e",
      name: "test:e2e",
      command: ["npm", "run", "test:e2e"],
    },
  ],
};

describe("pathMatches", () => {
  it("matches directory prefixes and exact files", () => {
    expect(pathMatches("packages/lib/src/a.ts", "packages/lib/")).toBe(true);
    expect(pathMatches("packages/lib", "packages/lib/")).toBe(true);
    expect(pathMatches("package.json", "package.json")).toBe(true);
    expect(pathMatches("packages/app/x.ts", "package.json")).toBe(false);
  });
});

describe("resolveSelectedCommandIds", () => {
  it("always selects commands without run_in_file_change", () => {
    expect(resolveSelectedCommandIds(stage, [], ["docs/readme.md"])).toEqual([
      "format:check",
      "test:e2e",
    ]);
  });

  it("selects from git paths and expands command:// refs", () => {
    expect(resolveSelectedCommandIds(stage, [], ["packages/lib/foo.ts"])).toEqual([
      "format:check",
      "test:lib",
      "test:e2e",
    ]);
    expect(resolveSelectedCommandIds(stage, [], ["package.json"])).toEqual([
      "format:check",
      "test:lib",
      "test:app",
      "deps",
      "test:e2e",
    ]);
    expect(
      runnableSelectedIds(stage, resolveSelectedCommandIds(stage, [], ["package.json"])),
    ).toEqual(["format:check", "test:lib", "test:app", "test:e2e"]);
  });

  it("honors explicit command args and still includes always-on", () => {
    expect(resolveSelectedCommandIds(stage, ["test:lib"], [])).toEqual([
      "format:check",
      "test:lib",
      "test:e2e",
    ]);
    expect(resolveSelectedCommandIds(stage, ["all"], []).length).toBe(stage.commands.length);
  });
});

describe("invalidCommandArgs", () => {
  it("rejects unknown tokens", () => {
    expect(invalidCommandArgs(["test:lib", "nope"], ["test:lib", "test:app"])).toEqual(["nope"]);
    expect(invalidCommandArgs(["all"], ["test:lib"])).toEqual([]);
  });
});
