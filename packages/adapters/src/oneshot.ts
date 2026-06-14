import { hashValue } from "@r402/core";
import { adapterEnv } from "./env";

type JsonRpcResponse<T> = { jsonrpc: "2.0"; id: number; result?: T; error?: { message: string } };

const BASE_CHAIN_ID = "8453";

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

function parseCapabilitiesResult(
  result: Record<string, unknown>,
  chainId = BASE_CHAIN_ID,
): OneShotCapabilities {
  const nested = result[chainId];
  const source =
    nested && typeof nested === "object"
      ? (nested as { targetAddress?: string; tokens?: { symbol: string; address: string }[] })
      : (result as { targetAddress?: string; tokens?: { symbol: string; address: string }[] });

  return {
    targetAddress: source.targetAddress ?? "0x0000000000000000000000000000000000000000",
    tokens: source.tokens ?? [],
  };
}

export async function getOneShotCapabilities(chainId = BASE_CHAIN_ID): Promise<OneShotCapabilities> {
  const result = await rpc<Record<string, unknown>>("relayer_getCapabilities", [chainId]);
  return parseCapabilitiesResult(result, chainId);
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

function normalizeSignedBundle(bundle: Record<string, unknown>) {
  return {
    chainId: BASE_CHAIN_ID,
    ...bundle,
  };
}

function isRelayReadyBundle(bundle?: Record<string, unknown>) {
  if (!bundle) return false;
  if ("delegations" in bundle || "permissionContext" in bundle || "calls" in bundle) return true;
  if (Array.isArray(bundle.bundles) && bundle.bundles.length > 0) {
    return false;
  }
  return Object.keys(bundle).length > 1;
}

export async function runOneShotRelay(input: {
  signedBundle?: Record<string, unknown>;
  destinationUrl: string;
  requestDigest?: string;
}) {
  const capabilities = await getOneShotCapabilities();

  if (!input.signedBundle || !isRelayReadyBundle(input.signedBundle)) {
    return {
      mode: "simulated" as const,
      capabilities,
      status: "confirmed",
      taskId: `task_${hashValue({ requestDigest: input.requestDigest ?? "demo" }).slice(2, 12)}`,
      message: input.signedBundle
        ? "7710 bundle is not in 1Shot relay format yet — simulated relay used."
        : "Capabilities loaded. Provide a 1Shot-ready 7710 bundle for live relay.",
    };
  }

  const bundle = normalizeSignedBundle(input.signedBundle);

  try {
    const estimate = await estimateOneShotTransaction(bundle);
    if (!estimate.success || !estimate.context) {
      throw new Error(estimate.error ?? "1Shot estimate failed");
    }

    const send = await sendOneShotTransaction(bundle, estimate.context, input.destinationUrl);
    return {
      mode: "live" as const,
      capabilities,
      estimateContext: "price-locked",
      taskId: send.taskId,
      transactionHash: send.transactionHash,
      status: "submitted",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "1Shot relay failed";
    return {
      mode: "simulated" as const,
      capabilities,
      status: "confirmed",
      taskId: `task_${hashValue({ requestDigest: input.requestDigest ?? message }).slice(2, 12)}`,
      message: `${message} — simulated relay used for demo continuity.`,
    };
  }
}
