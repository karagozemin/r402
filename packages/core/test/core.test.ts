import { describe, expect, it } from "vitest";
import {
  buildDelegationTree,
  createRequestDigest,
  hashValue,
  IdempotencyGuard,
  sanitizeMetadata,
} from "../src";
import type { ExecutionPlan } from "../src";

const plan: ExecutionPlan = {
  intent: "Buy private research from an x402 endpoint",
  chainId: 8453,
  maxBudgetUSDC: 8,
  x402Resources: ["https://api.venice.ai/api/v1/chat/completions"],
  allowedTargets: ["0x1111111111111111111111111111111111111111"],
  requiredFunctions: ["anchorProof(bytes32,bytes32,bytes32)"],
  justification: "Research and anchor an auditable proof.",
  proofSummary: "Bound request, relay task, and final transaction.",
};

describe("proof-bound core", () => {
  it("creates deterministic request digests", () => {
    const input = {
      method: "POST",
      url: plan.x402Resources[0],
      body: { a: 1, b: 2 },
      quoteHash: "0x01",
      planHash: "0x02",
      delegationHash: "0x03",
    };
    expect(createRequestDigest(input)).toBe(
      createRequestDigest({ ...input, body: { b: 2, a: 1 } }),
    );
  });

  it("narrows every child budget beneath the root", () => {
    const tree = buildDelegationTree(plan);
    expect(tree.slice(1).every((node) => node.limitUSDC <= tree[0].limitUSDC)).toBe(true);
  });

  it("uses a fresh delegation salt for a new permission chain", () => {
    expect(hashValue(buildDelegationTree(plan, "salt-a"))).not.toBe(
      hashValue(buildDelegationTree(plan, "salt-b")),
    );
  });

  it("blocks a replayed digest", () => {
    const guard = new IdempotencyGuard();
    expect(guard.consume("0xabc")).toBe(true);
    expect(guard.consume("0xabc")).toBe(false);
  });

  it("removes private metadata before payment", () => {
    const result = sanitizeMetadata({ email: "a@b.com", query: "yield", wallet_label: "main" });
    expect(result.clean).toEqual({ query: "yield" });
    expect(result.removed).toEqual(["email", "wallet_label"]);
  });
});
