import { createHmac, timingSafeEqual } from "node:crypto";
import { adapterEnv } from "./env";

export function verifyOneShotWebhook(input: { rawBody: string; signatureHeader?: string | null }) {
  const secret = process.env.ONE_SHOT_WEBHOOK_SECRET ?? adapterEnv.oneShotWebhookSecret;
  if (!secret) {
    return { verified: false, reason: "ONE_SHOT_WEBHOOK_SECRET not configured" };
  }
  if (!input.signatureHeader) {
    return { verified: false, reason: "Missing signature header" };
  }

  const expected = createHmac("sha256", secret).update(input.rawBody).digest("hex");
  const provided = input.signatureHeader.replace(/^sha256=/, "");

  try {
    const ok = timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
    return ok
      ? { verified: true as const }
      : { verified: false as const, reason: "Signature mismatch" };
  } catch {
    return { verified: false, reason: "Invalid signature format" };
  }
}
