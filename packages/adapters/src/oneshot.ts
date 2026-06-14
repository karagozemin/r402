import { adapterEnv } from "./env";

type JsonRpcResponse<T> = { jsonrpc: "2.0"; id: number; result?: T; error?: { message: string } };

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const response = await fetch(adapterEnv.oneShotRelayer, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  const payload = (await response.json()) as JsonRpcResponse<T>;
  if (payload.error) throw new Error(payload.error.message);
  if (payload.result === undefined) throw new Error(`1Shot ${method} returned no result`);
  return payload.result;
}

export type OneShotCapabilities = {
  targetAddress: string;
  tokens: { symbol: string; address: string }[];
};

export async function getOneShotCapabilities(chainId = "8453"): Promise<OneShotCapabilities> {
  const result = await rpc<{
    targetAddress: string;
    tokens?: { symbol: string; address: string }[];
  }>("relayer_getCapabilities", [chainId]);

  return {
    targetAddress: result.targetAddress,
    tokens: result.tokens ?? [],
  };
}

export async function estimateOneShotTransaction(signedBundle: Record<string, unknown>) {
  return rpc<{ success: boolean; context?: unknown; error?: string }>(
    "relayer_estimate7710Transaction",
    [signedBundle],
  );
}

export async function sendOneShotTransaction(
  signedBundle: Record<string, unknown>,
  context: unknown,
  destinationUrl: string,
) {
  return rpc<{ taskId: string; transactionHash?: string }>("relayer_send7710Transaction", [
    { ...signedBundle, context, destinationUrl },
  ]);
}

export async function runOneShotRelay(input: {
  signedBundle?: Record<string, unknown>;
  destinationUrl: string;
}) {
  const capabilities = await getOneShotCapabilities();

  if (!input.signedBundle) {
    return {
      mode: "capabilities-only" as const,
      capabilities,
      status: "ready",
      message: "Capabilities loaded. Provide signed 7710 bundle to estimate and send.",
    };
  }

  const estimate = await estimateOneShotTransaction(input.signedBundle);
  if (!estimate.success || !estimate.context) {
    throw new Error(estimate.error ?? "1Shot estimate failed");
  }

  const send = await sendOneShotTransaction(input.signedBundle, estimate.context, input.destinationUrl);
  return {
    mode: "live" as const,
    capabilities,
    estimateContext: "price-locked",
    taskId: send.taskId,
    transactionHash: send.transactionHash,
    status: "submitted",
  };
}
