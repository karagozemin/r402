import { verifyOneShotWebhook } from "@r402/adapters";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-1shot-signature") ?? request.headers.get("x-signature");
  const verification = verifyOneShotWebhook({ rawBody, signatureHeader: signature });

  if (!verification.verified) {
    return NextResponse.json({ error: verification.reason ?? "Invalid webhook" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody) as { taskId?: string; status?: string; transactionHash?: string };
  return NextResponse.json({
    ok: true,
    taskId: payload.taskId,
    status: payload.status ?? "confirmed",
    transactionHash: payload.transactionHash,
  });
}
