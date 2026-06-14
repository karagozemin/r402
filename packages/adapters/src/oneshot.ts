import { decodeDelegations } from "@metamask/smart-accounts-kit/utils";
import { bytesToHex } from "viem/utils";
import {
  createPublicClient,
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  http,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import { base } from "viem/chains";
import { adapterEnv } from "./env";

type JsonRpcResponse<T> = { jsonrpc: "2.0"; id: number; result?: T; error?: { message: string; code?: number } };

const BASE_CHAIN_ID = "8453";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address;
const WORK_USDC_AMOUNT = parseUnits("0.01", 6);

export type OneShotCapabilities = {
  targetAddress: string;
  feeCollector: string;
  tokens: { symbol: string; address: string; decimals?: string }[];
};

type FeeData = {
  chainId: string;
  token: { address: Address; decimals: number; symbol?: string };
  rate: number;
  minFee: string;
  expiry: number;
  gasPrice: Hex;
  feeCollector: Address;
  targetAddress: Address;
  context?: string;
};

type Estimate7710Result = {
  success: boolean;
  gasUsed: Record<string, string>;
  requiredPaymentAmount?: string;
  context?: string;
  error?: string;
};

type Send7710Params = {
  chainId: string;
  transactions: Array<{
    permissionContext: unknown[];
    executions: Array<{ target: Address; value: string; data: Hex }>;
  }>;
  destinationUrl?: string;
  context?: string;
};

async function rpc<T>(method: string, params: unknown): Promise<T> {
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

export function toRelayerJson(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "bigint") return `0x${value.toString(16)}`;
  if (value instanceof Uint8Array) return bytesToHex(value);
  if (Array.isArray(value)) return value.map(toRelayerJson);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) out[key] = toRelayerJson(entry);
    return out;
  }
  return value;
}

function parseCapabilitiesResult(
  result: Record<string, unknown>,
  chainId = BASE_CHAIN_ID,
): OneShotCapabilities {
  const nested = result[chainId];
  const source =
    nested && typeof nested === "object"
      ? (nested as {
          targetAddress?: string;
          feeCollector?: string;
          tokens?: { symbol: string; address: string; decimals?: string }[];
        })
      : (result as {
          targetAddress?: string;
          feeCollector?: string;
          tokens?: { symbol: string; address: string; decimals?: string }[];
        });

  return {
    targetAddress: source.targetAddress ?? "0x0000000000000000000000000000000000000000",
    feeCollector: source.feeCollector ?? "0x0000000000000000000000000000000000000000",
    tokens: source.tokens ?? [],
  };
}

export async function getOneShotCapabilities(chainId = BASE_CHAIN_ID): Promise<OneShotCapabilities> {
  const result = await rpc<Record<string, unknown>>("relayer_getCapabilities", [chainId]);
  return parseCapabilitiesResult(result, chainId);
}

async function getOneShotFeeData(token = USDC_BASE) {
  return rpc<FeeData>("relayer_getFeeData", { chainId: BASE_CHAIN_ID, token });
}

export async function estimateOneShotTransaction(params: Send7710Params) {
  return rpc<Estimate7710Result>("relayer_estimate7710Transaction", params);
}

export async function sendOneShotTransaction(params: Send7710Params & { context?: unknown }) {
  return rpc<{ taskId: string; transactionHash?: string }>("relayer_send7710Transaction", params);
}

function parseFeeAmount(minFee: string, decimals: number) {
  if (minFee.includes(".")) return parseUnits(minFee, decimals);
  return BigInt(minFee);
}

function delegatorFromContext(permissionContext: Hex): Address {
  const rootDelegations = decodeDelegations(permissionContext);
  const delegator = (rootDelegations[0] as { delegator?: Address }).delegator;
  if (!delegator) throw new Error("Permission context is missing the delegator address.");
  return delegator;
}

async function assertDelegatorUsdcBalance(delegator: Address, required: bigint) {
  const client = createPublicClient({ chain: base, transport: http(adapterEnv.baseRpc) });
  const balance = await client.readContract({
    address: USDC_BASE,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [delegator],
  });
  if (balance < required) {
    throw new Error(
      `Fund your MetaMask Smart Account with at least ${formatUnits(required, 6)} USDC on Base for the 1Shot relayer fee. Current balance: ${formatUnits(balance, 6)} USDC at ${delegator}.`,
    );
  }
}

function formatEstimateError(error: string, delegator: Address) {
  if (/transfer amount exceeds balance/i.test(error)) {
    return `${error} Send USDC on Base to your connected Smart Account (${delegator}) — the relayer fee is paid in USDC, not ETH.`;
  }
  if (/invalid-execution-length/i.test(error)) {
    return `${error} Periodic USDC permissions only allow ERC-20 transfer executions. Re-grant permission, then retry Execute.`;
  }
  return error;
}

function workTransferRecipient(delegator: Address): Address {
  return adapterEnv.sessionAccount ?? delegator;
}

export async function buildOneShotSendParams(input: {
  permissionContext: Hex;
  destinationUrl: string;
  feeAmount?: bigint;
}): Promise<Send7710Params> {
  const capabilities = await getOneShotCapabilities();
  const feeData = await getOneShotFeeData();
  const rootDelegations = decodeDelegations(input.permissionContext);

  if (!rootDelegations.length) {
    throw new Error("Permission context does not contain any delegations.");
  }

  const firstDelegate = String(
    (rootDelegations[0] as { delegate?: string }).delegate ?? "",
  ).toLowerCase();
  if (firstDelegate !== capabilities.targetAddress.toLowerCase()) {
    throw new Error(
      `Re-grant permission: MetaMask must delegate to the 1Shot relayer target ${capabilities.targetAddress}, not ${firstDelegate}.`,
    );
  }

  const feeAmount = input.feeAmount ?? parseFeeAmount(feeData.minFee, feeData.token.decimals);
  const delegator = delegatorFromContext(input.permissionContext);
  await assertDelegatorUsdcBalance(delegator, feeAmount + WORK_USDC_AMOUNT);

  const permissionContext = rootDelegations.map((delegation) => toRelayerJson(delegation));

  const feeTransfer = {
    target: feeData.token.address,
    value: "0",
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [feeData.feeCollector, feeAmount],
    }),
  };

  const workTransfer = {
    target: feeData.token.address,
    value: "0",
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [workTransferRecipient(delegator), WORK_USDC_AMOUNT],
    }),
  };

  return {
    chainId: BASE_CHAIN_ID,
    destinationUrl: input.destinationUrl,
    transactions: [
      {
        permissionContext,
        executions: [feeTransfer, workTransfer],
      },
    ],
  };
}

export async function runOneShotRelay(input: {
  permissionContext?: Hex;
  signedBundle?: Record<string, unknown>;
  destinationUrl: string;
  requestDigest?: string;
}) {
  const capabilities = await getOneShotCapabilities();
  const permissionContext =
    input.permissionContext ?? (input.signedBundle?.permissionContext as Hex | undefined);

  if (!permissionContext) {
    throw new Error("Live 1Shot relay requires permissionContext from Grant.");
  }

  const delegator = delegatorFromContext(permissionContext);
  const feeData = await getOneShotFeeData();
  const initialFee = parseFeeAmount(feeData.minFee, feeData.token.decimals);

  let sendParams = await buildOneShotSendParams({
    permissionContext,
    destinationUrl: input.destinationUrl,
    feeAmount: initialFee,
  });

  let estimate = await estimateOneShotTransaction(sendParams);
  if (
    !estimate.success &&
    estimate.error &&
    /transfer amount exceeds balance/i.test(estimate.error)
  ) {
    throw new Error(formatEstimateError(estimate.error, delegator));
  }

  if (estimate.success && estimate.requiredPaymentAmount) {
    const quotedFee = BigInt(estimate.requiredPaymentAmount);
    if (quotedFee !== initialFee) {
      sendParams = await buildOneShotSendParams({
        permissionContext,
        destinationUrl: input.destinationUrl,
        feeAmount: quotedFee,
      });
      estimate = await estimateOneShotTransaction(sendParams);
    }
  }

  if (!estimate.success || !estimate.context) {
    const message = estimate.error ?? "1Shot estimate failed";
    throw new Error(formatEstimateError(message, delegator));
  }

  const send = await sendOneShotTransaction({
    ...sendParams,
    context: estimate.context,
  });

  return {
    mode: "live" as const,
    capabilities,
    estimateContext: "price-locked",
    taskId: send.taskId,
    transactionHash: send.transactionHash,
    status: "submitted",
  };
}
