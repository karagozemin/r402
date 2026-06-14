import { buildDelegationTree, planSchema } from "@r402/core";
import {
  adapterEnv,
  buildSignedRedelegations,
  isBlankPermissionContext,
  redelegationReady,
} from "@r402/adapters";
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

    if (isBlankPermissionContext(permissionContext)) {
      return NextResponse.json(
        {
          error:
            "MetaMask returned an empty permission context (0x000…). Use MetaMask Flask 13.9+, upgrade to a Smart Account on Base, then grant again.",
        },
        { status: 400 },
      );
    }

    if (adapterEnv.oneShotLive) {
      return NextResponse.json({
        mode: "live",
        delegations: buildDelegationTree(plan, body.salt ?? "live-salt"),
        bundles: [],
        message:
          "Root grant delegates directly to the 1Shot relayer. Child scopes are enforced at execution via the proof-bound plan.",
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
