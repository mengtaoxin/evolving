import { pathMatches, resolveSuiteIds, invalidSuiteArgs } from "../src/detect.ts";
import type { VerifyGate } from "../src/types.ts";

const gate: VerifyGate = {
  detect: "git",
  suites: {
    lib: {
      paths: ["packages/lib/"],
      command: ["npm", "run", "test:lib"],
    },
    app: {
      paths: ["packages/app/"],
      command: ["npm", "run", "test:app"],
    },
    shared: {
      paths: ["packages/shared/"],
      also: ["lib", "app"],
      command: ["npm", "run", "test:shared"],
    },
    deps: {
      paths: ["package.json", "package-lock.json"],
      also: ["lib", "app"],
    },
  },
};

describe("pathMatches", () => {
  it("matches directory prefixes and exact files", () => {
    expect(pathMatches("packages/lib/src/a.ts", "packages/lib/")).toBe(true);
    expect(pathMatches("packages/lib", "packages/lib/")).toBe(true);
    expect(pathMatches("package.json", "package.json")).toBe(true);
    expect(pathMatches("packages/app/x.ts", "package.json")).toBe(false);
  });
});

describe("resolveSuiteIds", () => {
  it("selects suites from git paths and expands also", () => {
    expect(resolveSuiteIds(gate, [], ["packages/shared/index.ts"])).toEqual([
      "lib",
      "app",
      "shared",
    ]);
    expect(resolveSuiteIds(gate, [], ["package.json"])).toEqual(["lib", "app", "deps"]);
    expect(resolveSuiteIds(gate, [], ["packages/lib/foo.ts"])).toEqual(["lib"]);
    expect(resolveSuiteIds(gate, [], ["docs/readme.md"])).toEqual([]);
  });

  it("honors explicit suite args without expanding also", () => {
    expect(resolveSuiteIds(gate, ["shared"], [])).toEqual(["shared"]);
    expect(resolveSuiteIds(gate, ["lib", "app"], [])).toEqual(["lib", "app"]);
    expect(resolveSuiteIds(gate, ["all"], [])).toEqual(["lib", "app", "shared", "deps"]);
  });
});

describe("invalidSuiteArgs", () => {
  it("rejects unknown tokens", () => {
    expect(invalidSuiteArgs(["lib", "nope"], ["lib", "app", "shared"])).toEqual(["nope"]);
    expect(invalidSuiteArgs(["all"], ["lib"])).toEqual([]);
  });
});
