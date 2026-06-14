"use client";

import { erc7715ProviderActions } from "@metamask/smart-accounts-kit/actions";
import { getSmartAccountsEnvironment } from "@metamask/smart-accounts-kit";
import {
  createPublicClient,
  createWalletClient,
  custom,
  getAddress,
  http,
  parseUnits,
  type Address,
  type EIP1193Provider,
  type Hex,
} from "viem";
import { base } from "viem/chains";

const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BASE_RPC = process.env.NEXT_PUBLIC_BASE_RPC_URL ?? "https://mainnet.base.org";
const PERIODIC_TYPE = "erc20-token-periodic";
const DELEGATION_PREFIX = "0xef0100";

type SmartAccountsEnvironment = ReturnType<typeof getSmartAccountsEnvironment>;

export type GrantedPermission = {
  context: Hex;
  delegationManager: Address;
  chainId: number;
  to: Address;
  from: Address;
  granted: unknown;
};

export type MetaMaskAccountDiagnostics = {
  grantor: Address;
  chainId: number;
  supports7715: boolean;
  supportsPeriodicOnBase: boolean;
  smartAccountOnBase: boolean;
  delegatorImpl?: Address;
  delegatorLabel?: string;
  hint: string;
};

export function isBlankPermissionContext(context?: Hex | null) {
  if (!context) return true;
  return context.replace(/^0x/i, "").replace(/0/g, "").length === 0;
}

function getProvider() {
  const provider = (window as Window & { ethereum?: EIP1193Provider }).ethereum;
  if (!provider) {
    throw new Error(
      "MetaMask Flask is required for live ERC-7715 permissions. Install MetaMask Flask 13.9+ from https://metamask.io/flask",
    );
  }
  return provider;
}

function createExtendedWalletClient(provider: EIP1193Provider) {
  return createWalletClient({
    chain: base,
    transport: custom(provider),
  }).extend(erc7715ProviderActions());
}

function createBasePublicClient() {
  return createPublicClient({ chain: base, transport: http(BASE_RPC) });
}

function extract7702Delegator(code: Hex): Address | null {
  if (code.length !== 48 || !code.toLowerCase().startsWith(DELEGATION_PREFIX.toLowerCase())) {
    return null;
  }
  return getAddress(`0x${code.slice(8)}`);
}

function delegatorLabel(
  delegator: Address,
  implementations: SmartAccountsEnvironment["implementations"],
) {
  for (const [name, address] of Object.entries(implementations)) {
    if (address && address.toLowerCase() === delegator.toLowerCase()) return name;
  }
  return "unknown";
}

async function ensureBaseNetwork(provider: EIP1193Provider) {
  const chainHex = `0x${base.id.toString(16)}`;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainHex }],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("4902") || message.toLowerCase().includes("unrecognized")) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: chainHex,
            chainName: "Base",
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: [BASE_RPC],
            blockExplorerUrls: ["https://basescan.org"],
          },
        ],
      });
      return;
    }
    throw new Error(`Switch to Base (chainId 8453) in MetaMask before granting. ${message}`);
  }
}

export async function inspectMetaMaskAccount(grantor?: Address): Promise<MetaMaskAccountDiagnostics> {
  const provider = getProvider();
  await ensureBaseNetwork(provider);

  const walletClient = createExtendedWalletClient(provider);
  const [connected] = await walletClient.getAddresses();
  const address = grantor ?? connected;
  if (!address) {
    throw new Error("Connect a MetaMask account first.");
  }

  let supports7715 = false;
  let supportsPeriodicOnBase = false;
  try {
    const supported = await walletClient.getSupportedExecutionPermissions();
    supports7715 = true;
    supportsPeriodicOnBase = Boolean(supported[PERIODIC_TYPE]?.chainIds.includes(base.id));
  } catch {
    supports7715 = false;
  }

  const publicClient = createBasePublicClient();
  const code = await publicClient.getCode({ address });
  const environment = getSmartAccountsEnvironment(base.id);
  const delegatorImpl = code ? extract7702Delegator(code) : null;
  const smartAccountOnBase = Boolean(
    delegatorImpl &&
      Object.values(environment.implementations).some(
        (impl) => impl && impl.toLowerCase() === delegatorImpl.toLowerCase(),
      ),
  );

  let hint = "Ready to request ERC-7715 on Base.";
  if (!supports7715) {
    hint =
      "This extension does not expose ERC-7715. Install MetaMask Flask 13.9+ (regular MetaMask is not enough).";
  } else if (!supportsPeriodicOnBase) {
    hint = "Flask is connected but erc20-token-periodic is not listed for Base yet.";
  } else if (!smartAccountOnBase) {
    hint =
      "ERC-7715 is available, but this address is not upgraded on Base yet. Stay on Base in MetaMask, open Accounts → Smart Account, upgrade on Base (not Ethereum mainnet), then grant again. Flask 13.9+ may also offer upgrade inside the grant popup.";
  }

  return {
    grantor: address,
    chainId: base.id,
    supports7715,
    supportsPeriodicOnBase,
    smartAccountOnBase,
    delegatorImpl: delegatorImpl ?? undefined,
    delegatorLabel: delegatorImpl ? delegatorLabel(delegatorImpl, environment.implementations) : undefined,
    hint,
  };
}

async function preflightGrant(provider: EIP1193Provider) {
  const walletClient = createExtendedWalletClient(provider);

  let supported: Record<string, { chainIds: number[]; ruleTypes: string[] }>;
  try {
    supported = await walletClient.getSupportedExecutionPermissions();
  } catch {
    throw new Error(
      "This wallet does not support ERC-7715 Advanced Permissions. Regular MetaMask returns empty 0x000… context — install MetaMask Flask 13.9+.",
    );
  }

  const periodic = supported[PERIODIC_TYPE];
  if (!periodic?.chainIds.includes(base.id)) {
    throw new Error(
      `Wallet does not support ${PERIODIC_TYPE} on Base (8453). Use MetaMask Flask 13.9+ with a Smart Account on Base.`,
    );
  }
}

function grantFailureMessage(diagnostics: MetaMaskAccountDiagnostics, grantTarget: Address) {
  const lines = [
    "MetaMask returned empty permission context (0x000…).",
    diagnostics.smartAccountOnBase
      ? `Your address is upgraded on Base (${diagnostics.delegatorLabel ?? diagnostics.delegatorImpl}).`
      : "Your address is still a plain EOA on Base — Smart Account upgrade is per network.",
    `Grant recipient must be the 1Shot relayer target ${grantTarget}.`,
    diagnostics.hint,
  ];
  return lines.join(" ");
}

async function fetchRelayerGrantTarget(): Promise<Address> {
  const response = await fetch("https://relayer.1shotapi.com/relayers", {
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
  if (!target) {
    throw new Error("Could not load 1Shot relayer targetAddress for Base.");
  }
  return getAddress(target);
}

export async function requestRootPermission(_sessionAccount?: Address): Promise<GrantedPermission> {
  const provider = getProvider();
  await ensureBaseNetwork(provider);

  const walletClient = createExtendedWalletClient(provider);
  const [grantor] = await walletClient.getAddresses();
  if (!grantor) throw new Error("Connect a MetaMask account before granting.");

  await preflightGrant(provider);

  const grantTarget = await fetchRelayerGrantTarget();

  const [granted] = await walletClient.requestExecutionPermissions([
    {
      chainId: base.id,
      from: grantor,
      expiry: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
      to: grantTarget,
      permission: {
        type: PERIODIC_TYPE,
        isAdjustmentAllowed: true,
        data: {
          tokenAddress: BASE_USDC,
          periodAmount: parseUnits("20", 6),
          periodDuration: 24 * 60 * 60,
          justification: "Proof-bound daily budget for r402 Sentinel",
        },
      },
    },
  ]);

  if (!granted) throw new Error("MetaMask did not return a permission grant.");

  let context = granted.context as Hex;
  let delegationManager = granted.delegationManager as Address;

  if (isBlankPermissionContext(context)) {
    const active = await walletClient.getGrantedExecutionPermissions();
    const match =
      active.find(
        (entry) =>
          entry.to?.toLowerCase() === grantTarget.toLowerCase() &&
          entry.chainId === base.id &&
          !isBlankPermissionContext(entry.context),
      ) ?? active.find((entry) => !isBlankPermissionContext(entry.context));

    if (match) {
      context = match.context;
      delegationManager = match.delegationManager as Address;
    }
  }

  if (isBlankPermissionContext(context)) {
    const diagnostics = await inspectMetaMaskAccount(grantor);
    throw new Error(grantFailureMessage(diagnostics, grantTarget));
  }

  if (!delegationManager) {
    throw new Error("MetaMask grant is missing delegationManager — update MetaMask Flask.");
  }

  return {
    context,
    delegationManager,
    chainId: base.id,
    to: grantTarget,
    from: grantor,
    granted,
  };
}

export async function revokeRootPermission(permissionContext: Hex) {
  if (isBlankPermissionContext(permissionContext)) {
    throw new Error("Cannot revoke an empty permission context. Grant a live ERC-7715 permission first.");
  }

  const provider = getProvider();
  await ensureBaseNetwork(provider);

  try {
    await provider.request({
      method: "wallet_revokeExecutionPermission" as never,
      params: [{ permissionContext }] as never,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `MetaMask could not revoke this permission on-chain. Confirm in Flask that the grant is active, then retry. ${message}`,
    );
  }
}
