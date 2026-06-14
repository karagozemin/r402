"use client";

import { erc7715ProviderActions } from "@metamask/smart-accounts-kit/actions";
import {
  createWalletClient,
  custom,
  parseUnits,
  type Address,
  type EIP1193Provider,
  type Hex,
} from "viem";
import { base } from "viem/chains";

const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

function isBlankContext(context: Hex) {
  return context.replace(/^0x/i, "").replace(/0/g, "").length === 0;
}

export async function requestRootPermission(sessionAccount: Address) {
  const provider = (window as Window & { ethereum?: EIP1193Provider }).ethereum;
  if (!provider) throw new Error("MetaMask is required for a live ERC-7715 permission.");

  const walletClient = createWalletClient({
    chain: base,
    transport: custom(provider),
  }).extend(erc7715ProviderActions());

  const [granted] = await walletClient.requestExecutionPermissions([
    {
      chainId: base.id,
      expiry: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
      to: sessionAccount,
      permission: {
        type: "erc20-token-periodic",
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

  if (!granted) throw new Error("MetaMask did not return a permission context.");

  let context =
    typeof granted === "object" && granted !== null && "context" in granted
      ? (granted.context as Hex)
      : (granted as Hex);

  if (isBlankContext(context)) {
    try {
      const active = await walletClient.getGrantedExecutionPermissions();
      const match =
        active.find((entry) => entry.to?.toLowerCase() === sessionAccount.toLowerCase()) ??
        active.at(-1);
      if (match?.context && !isBlankContext(match.context)) {
        context = match.context;
      }
    } catch {
      // Fall back to the initial response if MetaMask does not expose active permissions yet.
    }
  }

  if (isBlankContext(context)) {
    throw new Error(
      "MetaMask returned an empty permission context. Use MetaMask Flask 13.5+, upgrade to a Smart Account on Base, and grant to the session address in NEXT_PUBLIC_SESSION_ACCOUNT.",
    );
  }

  return { context, granted };
}
