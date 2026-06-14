import { z } from "zod";

export const planSchema = z.object({
  intent: z.string().min(8),
  chainId: z.literal(8453),
  maxBudgetUSDC: z.number().positive().max(20),
  x402Resources: z.array(z.string().url()).min(1).max(3),
  allowedTargets: z.array(z.string()).min(1).max(5),
  requiredFunctions: z.array(z.string()).min(1).max(5),
  justification: z.string().min(8),
  proofSummary: z.string().min(8),
});

export type ExecutionPlan = z.infer<typeof planSchema>;

export type RiskAssessment = {
  score: number;
  verdict: "allow" | "review" | "block";
  note: string;
  findings: string[];
  controls: string[];
  piiFindings: string[];
};

export type DelegationNode = {
  id: string;
  label: string;
  role: string;
  limitUSDC: number;
  targets: string[];
  expiresIn: string;
  status: "ready" | "revoked";
};

export type ProofManifest = {
  jobId: `0x${string}`;
  planHash: `0x${string}`;
  delegationHash: `0x${string}`;
  requestDigest: `0x${string}`;
  quoteHash: `0x${string}`;
  relayTaskId: string;
  transactionHash: `0x${string}`;
  proofHash: `0x${string}`;
  paidUSDC: number;
  anchoredAt: string;
  status: "confirmed";
};
