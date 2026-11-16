import { AGENT_CONTRACT, agentContractText, SKIP_WHEN_VOCABULARY } from "../src/contract.ts";

describe("agent contract", () => {
  it("exposes stable contract fields", () => {
    expect(AGENT_CONTRACT.order).toEqual(["prepare", "verify"]);
    expect(AGENT_CONTRACT.finish_runs).toBe("workflow.kind=run only");
    expect(AGENT_CONTRACT.skip_when_vocabulary).toEqual([...SKIP_WHEN_VOCABULARY]);
  });

  it("renders a copy-pasteable protocol text", () => {
    const text = agentContractText();
    expect(text).toContain("evolving explain");
    expect(text).toContain("evolving prepare");
    expect(text).toContain("evolving verify");
    expect(text).toContain("--json");
    expect(text).toContain("kind: run");
    for (const token of SKIP_WHEN_VOCABULARY) {
      expect(text).toContain(token);
    }
  });
});
