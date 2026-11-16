import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { parseConfig } from "../src/load-config.ts";
import { printWorkflow } from "../src/workflow.ts";

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/minimal.evolving.yml",
);

describe("printWorkflow", () => {
  it("prints guidance and run steps", () => {
    const config = parseConfig(parseYaml(readFileSync(fixturePath, "utf8")));
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    try {
      printWorkflow(config);
    } finally {
      console.log = original;
    }
    const text = lines.join("\n");
    expect(text).toContain("[guidance] orient");
    expect(text).toContain("[run] verify");
    expect(text).toContain("npx evolving verify");
    expect(text).toContain("gates.prepare");
    expect(text).toContain("evolving prepare");
    expect(text).toContain("format: npm run format");
  });
});
