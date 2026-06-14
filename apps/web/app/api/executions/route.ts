import {
  buildProofManifest,
  createRequestDigest,
  hashValue,
  IdempotencyGuard,
  planSchema,
  sanitizeMetadata,
} from "@r402/core";
import { NextResponse } from "next/server";

const guard = new IdempotencyGuard();

export async function POST(request: Request) {
  const body = await request.json();
  const plan = planSchema.parse(body.plan);
  const planHash = hashValue(plan);
  const delegationHash = hashValue(body.delegations);
  const quoteHash = hashValue({ chainId: 8453, asset: "USDC", amount: "0.18" });
  const requestDigest = createRequestDigest({
    method: "POST",
    url: plan.x402Resources[0],
    body: { intent: plan.intent },
    quoteHash,
    planHash,
    delegationHash,
  });

  if (!guard.consume(requestDigest)) {
    return NextResponse.json(
      {
        error: "Duplicate x402 request blocked",
        code: "REPLAY_BLOCKED",
        requestDigest,
      },
      { status: 409 },
    );
  }

  const metadata = sanitizeMetadata({
    query: plan.intent,
    email: "operator@r402.dev",
    wallet_label: "primary",
  });

  return NextResponse.json({
    manifest: buildProofManifest(plan, body.delegations),
    metadata,
    relay: {
      provider: "1Shot permissionless relayer",
      network: "Base",
      capabilitySource: "relayer_getCapabilities",
      estimateContext: "price-locked",
      status: "confirmed",
    },
    events: [
      { label: "402 challenge received", detail: "Payment required: 0.18 USDC" },
      { label: "Request digest locked", detail: requestDigest },
      { label: "PII metadata removed", detail: metadata.removed.join(", ") },
      { label: "Paid request accepted", detail: "HTTP 200 + PAYMENT-RESPONSE" },
      { label: "1Shot relay confirmed", detail: "7702 / 7710 execution bundle" },
      { label: "Proof anchored", detail: "ProofRegistry emitted ProofAnchored" },
    ],
  });
}
