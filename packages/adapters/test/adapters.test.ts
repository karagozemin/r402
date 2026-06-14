import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyOneShotWebhook } from "../src/webhook";
import { envFlag } from "../src/env";

describe("@r402/adapters", () => {
  it("verifies webhook signatures when secret is configured", () => {
    process.env.ONE_SHOT_WEBHOOK_SECRET = "test-secret";
    const body = JSON.stringify({ taskId: "task_123", status: "confirmed" });
    const signature = createHmac("sha256", "test-secret").update(body).digest("hex");
    expect(verifyOneShotWebhook({ rawBody: body, signatureHeader: signature }).verified).toBe(true);
    expect(verifyOneShotWebhook({ rawBody: body, signatureHeader: "bad" }).verified).toBe(false);
  });

  it("reads env flags", () => {
    process.env.TEST_FLAG = "true";
    expect(envFlag("TEST_FLAG")).toBe(true);
    process.env.TEST_FLAG = "0";
    expect(envFlag("TEST_FLAG")).toBe(false);
  });
});
