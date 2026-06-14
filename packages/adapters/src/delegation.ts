import {
  Implementation,
  ScopeType,
  createCaveatEnforcerClient,
  createDelegation,
  getSmartAccountsEnvironment,
  toMetaMaskSmartAccount,
} from "@metamask/smart-accounts-kit";
import { decodeDelegations } from "@metamask/smart-accounts-kit/utils";
import {
  createPublicClient,
  http,
  parseUnits,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import type { ExecutionPlan } from "@r402/core";
import { adapterEnv, redelegationReady } from "./env";

export function isBlankPermissionContext(context?: Hex | null) {
  if (!context) return true;
  return context.replace(/^0x/i, "").replace(/0/g, "").length === 0;
}

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address;

export type RedelegationBundle = {
  agent: "payment" | "execution" | "proof" | "relay";
  delegation: unknown;
  signature: Hex;
};

function createBasePublicClient() {
  return createPublicClient({ chain: base, transport: http(adapterEnv.baseRpc) });
}

async function fetchOneShotRelayTarget() {
  const response = await fetch(adapterEnv.oneShotRelayer, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "relayer_getCapabilities",
      params: ["8453"],
    }),
  });
  const payload = (await response.json()) as {
    result?: Record<string, { targetAddress?: string }>;
    error?: { message: string };
  };
  if (payload.error) throw new Error(payload.error.message);
  const target = payload.result?.["8453"]?.targetAddress;
  if (!target) throw new Error("1Shot relayer did not return a Base targetAddress.");
  return target as Address;
}

export async function buildSignedRedelegations(input: {
  permissionContext: Hex;
  plan: ExecutionPlan;
}) {
  if (!adapterEnv.sessionPrivateKey || !adapterEnv.sessionAccount) {
    throw new Error("SESSION_PRIVATE_KEY and NEXT_PUBLIC_SESSION_ACCOUNT are required");
  }

  const signer = privateKeyToAccount(adapterEnv.sessionPrivateKey);
  const publicClient = createBasePublicClient();
  const sessionAccount = await toMetaMaskSmartAccount({
    client: publicClient as PublicClient,
    implementation: Implementation.Hybrid,
    deployParams: [signer.address, [], [], []],
    deploySalt: "0x",
    signer: { account: signer },
  });

  const paymentTarget = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
  const executionTarget = input.plan.allowedTargets[0] as Address;
  const proofTarget = (adapterEnv.proofRegistry ?? executionTarget) as Address;
  const relayCaps = await fetchOneShotRelayTarget();
  const relayTarget = relayCaps;

  const bundles: RedelegationBundle[] = [];

  const paymentDelegation = createDelegation({
    from: sessionAccount.address,
    to: paymentTarget,
    environment: sessionAccount.environment,
    scope: {
      type: ScopeType.Erc20TransferAmount,
      tokenAddress: USDC_BASE,
      maxAmount: parseUnits(String(Math.min(2, input.plan.maxBudgetUSDC)), 6),
    },
    parentPermissionContext: input.permissionContext,
  });
  bundles.push({
    agent: "payment",
    delegation: paymentDelegation,
    signature: await sessionAccount.signDelegation({ delegation: paymentDelegation }),
  });

  const executionDelegation = createDelegation({
    from: sessionAccount.address,
    to: executionTarget,
    environment: sessionAccount.environment,
    scope: {
      type: ScopeType.FunctionCall,
      targets: input.plan.allowedTargets.slice(0, 2) as Address[],
      selectors: input.plan.requiredFunctions.slice(0, 2),
    },
    parentPermissionContext: input.permissionContext,
  });
  bundles.push({
    agent: "execution",
    delegation: executionDelegation,
    signature: await sessionAccount.signDelegation({ delegation: executionDelegation }),
  });

  const proofDelegation = createDelegation({
    from: sessionAccount.address,
    to: proofTarget,
    environment: sessionAccount.environment,
    scope: {
      type: ScopeType.FunctionCall,
      targets: [proofTarget],
      selectors: ["anchorProof(bytes32,bytes32,bytes32)"],
    },
    parentPermissionContext: input.permissionContext,
  });
  bundles.push({
    agent: "proof",
    delegation: proofDelegation,
    signature: await sessionAccount.signDelegation({ delegation: proofDelegation }),
  });

  const relayDelegation = createDelegation({
    from: sessionAccount.address,
    to: relayTarget,
    environment: sessionAccount.environment,
    scope: {
      type: ScopeType.Erc20TransferAmount,
      tokenAddress: USDC_BASE,
      maxAmount: parseUnits(String(Math.min(22, input.plan.maxBudgetUSDC)), 6),
    },
    parentPermissionContext: input.permissionContext,
  });
  bundles.push({
    agent: "relay",
    delegation: relayDelegation,
    signature: await sessionAccount.signDelegation({ delegation: relayDelegation }),
  });

  return { sessionAccount: sessionAccount.address, bundles, relayTarget };
}

export async function readRemainingBudget(permissionContext?: Hex) {
  if (!redelegationReady()) {
    return { mode: "simulated" as const, availableUSDC: 20 };
  }

  if (isBlankPermissionContext(permissionContext)) {
    throw new Error(
      "Cannot read live budget from an empty permission context. Grant a real ERC-7715 permission from MetaMask Flask first.",
    );
  }

  const environment = getSmartAccountsEnvironment(base.id);
  const publicClient = createBasePublicClient();
  const caveatClient = createCaveatEnforcerClient({
    client: publicClient as PublicClient,
    environment,
  });
  const delegations = decodeDelegations(permissionContext!);
  const rootDelegation = delegations[delegations.length - 1];
  if (!rootDelegation) {
    throw new Error("Permission context does not contain a root delegation.");
  }

  const { availableAmount } = await caveatClient.getErc20PeriodTransferEnforcerAvailableAmount({
    delegation: rootDelegation,
  });
  return {
    mode: "live" as const,
    availableUSDC: Number(availableAmount) / 1_000_000,
  };
}

export async function disableRootDelegation(input: {
  delegation?: unknown;
  permissionContext?: Hex;
  demo?: boolean;
}) {
  if (input.demo || !redelegationReady()) {
    return { mode: "simulated" as const };
  }

  throw new Error(
    "On-chain revoke must be signed by the user's MetaMask Smart Account. Use revokeRootPermission() in the browser — the session key cannot disable the root delegation.",
  );
}
