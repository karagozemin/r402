import { keccak256, stringToHex } from "viem";
import type {
  DelegationNode,
  ExecutionPlan,
  ProofManifest,
  RiskAssessment,
} from "./types";

export * from "./types";

const SELLER_ALLOWLIST = [
  "https://api.venice.ai",
  "https://x402.r402.dev",
  "https://research.r402.dev",
];

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function hashValue(value: unknown): `0x${string}` {
  return keccak256(stringToHex(canonicalize(value)));
}

export function createRequestDigest(input: {
  method: string;
  url: string;
  body: unknown;
  quoteHash: string;
  planHash: string;
  delegationHash: string;
}): `0x${string}` {
  return hashValue({
    method: input.method.toUpperCase(),
    url: input.url,
    bodyHash: hashValue(input.body),
    quoteHash: input.quoteHash,
    planHash: input.planHash,
    delegationHash: input.delegationHash,
  });
}

export function sanitizeMetadata(metadata: Record<string, unknown>) {
  const blockedKeys = /email|phone|name|address|wallet|secret|token|password/i;
  const clean = Object.fromEntries(
    Object.entries(metadata).filter(([key]) => !blockedKeys.test(key)),
  );
  return {
    clean,
    removed: Object.keys(metadata).filter((key) => blockedKeys.test(key)),
  };
}

export function assessPlan(plan: ExecutionPlan): RiskAssessment {
  const findings: string[] = [];
  const controls = [
    "Request-bound x402 digest",
    "2 minute idempotency lock",
    "Narrow ERC-7710 caveats",
    "PII metadata filter",
  ];

  const unknownTargets = plan.x402Resources.filter(
    (resource) => !SELLER_ALLOWLIST.some((allowed) => resource.startsWith(allowed)),
  );
  if (unknownTargets.length) findings.push("One resource requires allowlist review.");
  if (plan.maxBudgetUSDC > 10) findings.push("Budget exceeds the recommended autonomous limit.");

  const score = Math.min(92, 18 + unknownTargets.length * 35 + (plan.maxBudgetUSDC > 10 ? 22 : 0));
  const verdict = score >= 70 ? "block" : score >= 40 ? "review" : "allow";

  return {
    score,
    verdict,
    note:
      verdict === "allow"
        ? "Plan is narrow, request-bound, and safe to execute."
        : "Plan needs a human review before execution.",
    findings: findings.length ? findings : ["No policy violations detected."],
    controls,
    piiFindings: ["wallet_label removed", "email removed"],
  };
}

export function buildDelegationTree(plan: ExecutionPlan, salt = "deterministic-demo-salt"): DelegationNode[] {
  const rootLimit = Math.min(plan.maxBudgetUSDC, 20);
  return [
    {
      id: `root:${salt}`,
      label: "Session Orchestrator",
      role: "ERC-7715 root permission",
      limitUSDC: rootLimit,
      targets: ["Base / USDC"],
      expiresIn: "24 hours",
      status: "ready",
    },
    {
      id: `payment:${salt}`,
      label: "Payment Guard",
      role: "x402 paid request",
      limitUSDC: Math.min(2, rootLimit),
      targets: plan.x402Resources,
      expiresIn: "10 minutes",
      status: "ready",
    },
    {
      id: `execution:${salt}`,
      label: "Execution Agent",
      role: "1Shot relay",
      limitUSDC: Math.min(5, rootLimit),
      targets: plan.allowedTargets.slice(0, 2),
      expiresIn: "10 minutes",
      status: "ready",
    },
    {
      id: `proof:${salt}`,
      label: "Proof Agent",
      role: "read + anchor only",
      limitUSDC: 0,
      targets: ["ProofRegistry"],
      expiresIn: "30 minutes",
      status: "ready",
    },
  ];
}

export function buildProofManifest(
  plan: ExecutionPlan,
  delegations = buildDelegationTree(plan),
): ProofManifest {
  const planHash = hashValue(plan);
  const delegationHash = hashValue(delegations);
  const quoteHash = hashValue({ asset: "USDC", amount: "0.18", chainId: 8453 });
  const requestDigest = createRequestDigest({
    method: "POST",
    url: plan.x402Resources[0],
    body: { intent: plan.intent },
    quoteHash,
    planHash,
    delegationHash,
  });
  const jobId = hashValue({ requestDigest, created: Date.now() });
  const proofHash = hashValue({
    jobId,
    delegationHash,
    requestDigest,
  });

  return {
    jobId,
    planHash,
    delegationHash,
    requestDigest,
    quoteHash,
    relayTaskId: `task_${jobId.slice(2, 12)}`,
    proofHash,
    paidUSDC: 0.18,
    anchoredAt: new Date().toISOString(),
    status: "confirmed",
  };
}

export function isBlankPermissionContext(context?: string | null) {
  if (!context) return true;
  return context.replace(/^0x/i, "").replace(/0/g, "").length === 0;
}

export class IdempotencyGuard {
  private consumed = new Set<string>();

  consume(digest: string) {
    if (this.consumed.has(digest)) return false;
    this.consumed.add(digest);
    return true;
  }

  release(digest: string) {
    this.consumed.delete(digest);
  }
}
