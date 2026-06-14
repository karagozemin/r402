import {
  buildProofManifest,
  createRequestDigest,
  hashValue,
  type ExecutionPlan,
} from "@r402/core";
import { adapterEnv, liveExecutionReady } from "./env";
import { runOneShotRelay } from "./oneshot";
import { anchorProofOnChain } from "./proof";
import { runX402Payment } from "./x402";
import type { Hex } from "viem";

export async function runProtectedExecution(input: {
  plan: ExecutionPlan;
  delegations: unknown;
  permissionContext?: Hex;
  signedBundle?: Record<string, unknown>;
  quoteUSDC?: number;
}) {
  const quoteUSDC = input.quoteUSDC ?? 0.18;
  const planHash = hashValue(input.plan);
  const delegationHash = hashValue(input.delegations);
  const quoteHash = hashValue({ chainId: 8453, asset: "USDC", amount: String(quoteUSDC) });
  const requestDigest = createRequestDigest({
    method: "POST",
    url: input.plan.x402Resources[0],
    body: { intent: input.plan.intent },
    quoteHash,
    planHash,
    delegationHash,
  });

  const x402 = await runX402Payment({
    url: input.plan.x402Resources[0],
    method: "POST",
    body: { intent: input.plan.intent },
    live: adapterEnv.x402Live,
  });

  let relay:
    | Awaited<ReturnType<typeof runOneShotRelay>>
    | {
        mode: "simulated";
        capabilities: { targetAddress: string; tokens: { symbol: string; address: string }[] };
        status: string;
        taskId?: string;
        transactionHash?: string;
      };

  if (adapterEnv.oneShotLive) {
    relay = await runOneShotRelay({
      permissionContext: input.permissionContext,
      signedBundle: input.signedBundle,
      destinationUrl: `${adapterEnv.appUrl}/api/webhooks/oneshot`,
      requestDigest,
    });
  } else {
    relay = {
      mode: "simulated",
      capabilities: {
        targetAddress: input.plan.allowedTargets[0],
        tokens: [{ symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" }],
      },
      status: "confirmed",
      taskId: `task_${hashValue({ requestDigest }).slice(2, 12)}`,
    };
  }

  const manifest = buildProofManifest(input.plan, input.delegations as never);
  const anchor = await anchorProofOnChain({
    requestDigest: manifest.requestDigest,
    jobId: manifest.jobId,
    delegationHash: manifest.delegationHash,
    proofHash: manifest.proofHash,
  });

  const onChainTransactions: {
    anchor?: `0x${string}`;
    consume?: `0x${string}`;
    relay?: `0x${string}`;
  } = {};

  if (anchor.mode === "live") {
    if (anchor.transactionHash) onChainTransactions.anchor = anchor.transactionHash;
    if (anchor.consumeTransactionHash) onChainTransactions.consume = anchor.consumeTransactionHash;
  }

  if (relay.mode === "live" && "transactionHash" in relay && relay.transactionHash) {
    onChainTransactions.relay = relay.transactionHash as `0x${string}`;
  }

  const transactionHash =
    onChainTransactions.anchor ?? onChainTransactions.relay ?? onChainTransactions.consume;

  const live = liveExecutionReady();

  return {
    mode: live ? ("live" as const) : ("simulated" as const),
    requestDigest,
    manifest: {
      ...manifest,
      ...(transactionHash ? { transactionHash } : {}),
      ...(Object.keys(onChainTransactions).length ? { onChainTransactions } : {}),
      relayTaskId:
        "taskId" in relay && relay.taskId
          ? relay.taskId
          : manifest.relayTaskId,
    },
    metadata: "metadata" in x402 ? x402.metadata : undefined,
    x402,
    relay,
    anchor,
    events: [
      {
        label: "402 challenge received",
        detail: x402.status === 402 ? `Payment required: ${quoteUSDC} USDC` : `HTTP ${x402.status}`,
      },
      { label: "Request digest locked", detail: requestDigest },
      {
        label: "PII metadata removed",
        detail: x402.metadata?.removed.join(", ") ?? "email, wallet_label",
      },
      {
        label: "Paid request accepted",
        detail: x402.paymentResponse ? "HTTP 200 + PAYMENT-RESPONSE" : "Bound paid request simulated",
      },
      {
        label: "1Shot relay confirmed",
        detail:
          relay.mode === "live"
            ? `Task ${"taskId" in relay ? relay.taskId : "pending"}`
            : "7702 / 7710 execution bundle",
      },
      {
        label: "Proof anchored",
        detail:
          anchor.mode === "live" && anchor.transactionHash
            ? `ProofRegistry tx ${anchor.transactionHash}`
            : "ProofRegistry emitted ProofAnchored",
      },
    ],
  };
}
