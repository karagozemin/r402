import { disableRootDelegation } from "@r402/adapters";
import { NextResponse } from "next/server";
import type { Hex } from "viem";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await disableRootDelegation({
      permissionContext: body.permissionContext as Hex | undefined,
      demo: Boolean(body.demo),
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Revoke failed." },
      { status: 500 },
    );
  }
}
