import { sanitizeMetadata } from "@r402/core";

export type X402PaymentResult = {
  mode: "live" | "simulated";
  status: number;
  paymentResponse?: string | null;
  bodyPreview?: string;
};

export async function runX402Payment(input: {
  url: string;
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  live: boolean;
}) {
  const metadata = sanitizeMetadata({
    ...(typeof input.body === "object" && input.body ? (input.body as Record<string, unknown>) : {}),
    email: "operator@r402.dev",
    wallet_label: "primary",
  });

  const init: RequestInit = {
    method: input.method ?? "POST",
    headers: {
      "Content-Type": "application/json",
      ...input.headers,
      ...(input.live && process.env.VENICE_API_KEY
        ? { Authorization: `Bearer ${process.env.VENICE_API_KEY}` }
        : {}),
    },
    body: JSON.stringify(metadata.clean),
  };

  const first = await fetch(input.url, init);

  if (first.status === 402 && input.live) {
    const retry = await fetch(input.url, {
      ...init,
      headers: {
        ...init.headers,
        "X-PAYMENT-ATTEMPT": "bound",
      },
    });
    return {
      mode: "live" as const,
      status: retry.status,
      paymentResponse: retry.headers.get("PAYMENT-RESPONSE"),
      bodyPreview: (await retry.text()).slice(0, 240),
      metadata,
    } satisfies X402PaymentResult & { metadata: ReturnType<typeof sanitizeMetadata> };
  }

  if (first.status === 402) {
    return {
      mode: "simulated" as const,
      status: 402,
      paymentResponse: null,
      bodyPreview: "402 challenge captured — simulated PAYMENT-RESPONSE for demo binding.",
      metadata,
    };
  }

  return {
    mode: input.live ? ("live" as const) : ("simulated" as const),
    status: first.status,
    paymentResponse: first.headers.get("PAYMENT-RESPONSE"),
    bodyPreview: (await first.text()).slice(0, 240),
    metadata,
  } satisfies X402PaymentResult & { metadata: ReturnType<typeof sanitizeMetadata> };
}
