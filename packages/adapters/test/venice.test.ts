import { describe, expect, it } from "vitest";
import { normalizePlannerOutput } from "../src/venice";

describe("normalizePlannerOutput", () => {
  it("coerces Venice-style freeform JSON into a valid plan", () => {
    const plan = normalizePlannerOutput(
      {
        intent: "x",
        chainId: 1,
        maxBudgetUSDC: 1000,
        x402Resources: ["https://example.com/not-allowed"],
        allowedTargets: ["Maker Dai Savings Rate"],
        requiredFunctions: ["Compare stablecoin yields"],
      },
      "Research the safest Base USDC yield opportunity and anchor proof.",
    );

    expect(plan.chainId).toBe(8453);
    expect(plan.maxBudgetUSDC).toBe(8);
    expect(plan.x402Resources[0]).toBe("https://api.venice.ai/api/v1/chat/completions");
    expect(plan.allowedTargets[0]).toMatch(/^0x/);
    expect(plan.intent.length).toBeGreaterThanOrEqual(8);
  });
});
