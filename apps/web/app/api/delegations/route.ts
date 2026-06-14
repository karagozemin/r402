import { buildDelegationTree, planSchema } from "@r402/core";
import { buildSignedRedelegations, redelegationReady } from "@r402/adapters";
import { NextResponse } from "next/server";
import type { Hex } from "viem";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const plan = planSchema.parse(body.plan);
    const permissionContext = body.permissionContext as Hex | undefined;

    if (!permissionContext) {
      return NextResponse.json({ error: "permissionContext is required." }, { status: 400 });
    }

    if (!redelegationReady()) {
      return NextResponse.json({
        mode: "simulated",
        delegations: buildDelegationTree(plan, body.salt ?? "demo-salt"),
        message: "Add SESSION_PRIVATE_KEY for live ERC-7710 redelegation signing.",
      });
    }

    if (
      typeof permissionContext === "string" &&
      permissionContext.replace(/^0x/i, "").replace(/0/g, "").length === 0
    ) {
      return NextResponse.json({
        mode: "simulated",
        delegations: buildDelegationTree(plan, body.salt ?? "demo-salt"),
        message: "MetaMask returned an empty permission context. Redelegation skipped.",
      });
    }

    const signed = await buildSignedRedelegations({ permissionContext, plan });
    return NextResponse.json({
      mode: "live",
      sessionAccount: signed.sessionAccount,
      bundles: signed.bundles,
      delegations: buildDelegationTree(plan, body.salt ?? "live-salt"),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Redelegation failed." },
      { status: 500 },
    );
  }
}
