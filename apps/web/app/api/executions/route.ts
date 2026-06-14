import {
  buildProofManifest,
  createRequestDigest,
  hashValue,
  IdempotencyGuard,
  planSchema,
} from "@r402/core";
import { runProtectedExecution } from "@r402/adapters";
import { NextResponse } from "next/server";

const guard = new IdempotencyGuard();

export async function POST(request: Request) {
  const body = await request.json();
  const plan = planSchema.parse(body.plan);
  const planHash = hashValue(plan);
  const delegationHash = hashValue(body.delegations);
  const quoteUSDC = 0.18;
  const quoteHash = hashValue({ chainId: 8453, asset: "USDC", amount: String(quoteUSDC) });
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

  try {
    const result = await runProtectedExecution({
      plan,
      delegations: body.delegations,
      signedBundle: body.signedBundle,
      quoteUSDC,
    });

    return NextResponse.json({
      manifest: result.manifest,
      metadata: result.metadata ?? {
        clean: { query: plan.intent },
        removed: ["email", "wallet_label"],
      },
      relay: {
        provider: "1Shot permissionless relayer",
        network: "Base",
        capabilitySource: "relayer_getCapabilities",
        estimateContext: result.relay.mode === "live" ? "price-locked" : "simulated",
        status: result.relay.status ?? "confirmed",
        taskId: "taskId" in result.relay ? result.relay.taskId : undefined,
        targetAddress:
          "capabilities" in result.relay ? result.relay.capabilities.targetAddress : undefined,
      },
      anchor: result.anchor,
      mode: result.mode,
      events: result.events,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Execution failed.",
        manifest: buildProofManifest(plan, body.delegations),
      },
      { status: 500 },
    );
  }
}
