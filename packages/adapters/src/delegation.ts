import {
  Implementation,
  ScopeType,
  createCaveatEnforcerClient,
  createDelegation,
  getSmartAccountsEnvironment,
  toMetaMaskSmartAccount,
  type Delegation,
} from "@metamask/smart-accounts-kit";
import { DelegationManager } from "@metamask/smart-accounts-kit/contracts";
import { decodeDelegations } from "@metamask/smart-accounts-kit/utils";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import type { ExecutionPlan } from "@r402/core";
import { adapterEnv } from "./env";

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address;

export type RedelegationBundle = {
  agent: "payment" | "execution" | "proof";
  delegation: unknown;
  signature: Hex;
};

function createBasePublicClient() {
  return createPublicClient({ chain: base, transport: http(adapterEnv.baseRpc) });
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

  return { sessionAccount: sessionAccount.address, bundles };
}

export async function readRemainingBudget(permissionContext?: Hex) {
  if (!permissionContext || !adapterEnv.sessionPrivateKey) {
    return { mode: "simulated" as const, availableUSDC: 20 };
  }

  try {
    const environment = getSmartAccountsEnvironment(base.id);
    const publicClient = createBasePublicClient();
    const caveatClient = createCaveatEnforcerClient({
      client: publicClient as PublicClient,
      environment,
    });
    const delegations = decodeDelegations(permissionContext);
    const rootDelegation = delegations[delegations.length - 1];
    if (!rootDelegation) {
      return { mode: "simulated" as const, availableUSDC: 20 };
    }

    const { availableAmount } = await caveatClient.getErc20PeriodTransferEnforcerAvailableAmount({
      delegation: rootDelegation,
    });
    return {
      mode: "live" as const,
      availableUSDC: Number(availableAmount) / 1_000_000,
    };
  } catch {
    return { mode: "simulated" as const, availableUSDC: 20 };
  }
}

export async function disableRootDelegation(delegation: unknown) {
  if (!adapterEnv.sessionPrivateKey) {
    return { mode: "simulated" as const };
  }

  try {
    const environment = getSmartAccountsEnvironment(base.id);
    const account = privateKeyToAccount(adapterEnv.sessionPrivateKey);
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(adapterEnv.baseRpc),
    });

    const txHash = await DelegationManager.execute.disableDelegation({
      client: walletClient,
      delegationManagerAddress: environment.DelegationManager,
      delegation: delegation as Delegation,
    });
    return { mode: "live" as const, transactionHash: txHash };
  } catch {
    return { mode: "simulated" as const };
  }
}
