import { readRemainingBudget } from "@r402/adapters";
import { NextResponse } from "next/server";
import type { Hex } from "viem";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const budget = await readRemainingBudget(body.permissionContext as Hex | undefined);
    return NextResponse.json(budget);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Budget read failed." },
      { status: 500 },
    );
  }
}
