import type { Address, Hex } from "viem";

export function envFlag(name: string, fallback = false) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return value === "true" || value === "1";
}

export const adapterEnv = {
  baseRpc: process.env.BASE_RPC_URL ?? "https://mainnet.base.org",
  veniceApiKey: process.env.VENICE_API_KEY,
  veniceModel: process.env.VENICE_MODEL ?? "venice-uncensored-1-2",
  sessionPrivateKey: process.env.SESSION_PRIVATE_KEY as Hex | undefined,
  sessionAccount: process.env.NEXT_PUBLIC_SESSION_ACCOUNT as Address | undefined,
  proofRegistry: process.env.PROOF_REGISTRY_ADDRESS as Address | undefined,
  anchorPrivateKey: process.env.ANCHOR_PRIVATE_KEY as Hex | undefined,
  oneShotLive: envFlag("ONE_SHOT_LIVE"),
  oneShotRelayer: process.env.ONE_SHOT_RELAYER_URL ?? "https://relayer.1shotapi.com/relayers",
  oneShotWebhookSecret: process.env.ONE_SHOT_WEBHOOK_SECRET,
  x402Live: envFlag("X402_LIVE"),
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  explorer: process.env.NEXT_PUBLIC_BASE_EXPLORER ?? "https://basescan.org",
};

export function liveExecutionReady() {
  return Boolean(
    adapterEnv.oneShotLive &&
      adapterEnv.x402Live &&
      adapterEnv.proofRegistry &&
      adapterEnv.anchorPrivateKey,
  );
}

export function redelegationReady() {
  return Boolean(adapterEnv.sessionPrivateKey && adapterEnv.sessionAccount);
}
