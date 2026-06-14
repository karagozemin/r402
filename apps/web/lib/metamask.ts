"use client";

import { erc7715ProviderActions } from "@metamask/smart-accounts-kit/actions";
import {
  createWalletClient,
  custom,
  parseUnits,
  type Address,
  type EIP1193Provider,
} from "viem";
import { base } from "viem/chains";

const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

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
  return granted;
}
