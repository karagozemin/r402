import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { adapterEnv } from "./env";

const proofRegistryAbi = [
  {
    type: "function",
    name: "consumeRequest",
    stateMutability: "nonpayable",
    inputs: [{ name: "requestDigest", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "anchorProof",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "bytes32" },
      { name: "delegationHash", type: "bytes32" },
      { name: "proofHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "consumedRequestDigests",
    stateMutability: "view",
    inputs: [{ name: "requestDigest", type: "bytes32" }],
    outputs: [{ name: "consumed", type: "bool" }],
  },
  {
    type: "function",
    name: "latestProofHashByJob",
    stateMutability: "view",
    inputs: [{ name: "jobId", type: "bytes32" }],
    outputs: [{ name: "proofHash", type: "bytes32" }],
  },
] as const;

const ZERO_HASH = `0x${"0".repeat(64)}` as Hex;
const DELEGATION_PREFIX = "0xef0100";

function createClients() {
  const account = privateKeyToAccount(adapterEnv.anchorPrivateKey!);
  const transport = http(adapterEnv.baseRpc);
  return {
    account,
    publicClient: createPublicClient({ chain: base, transport }),
    walletClient: createWalletClient({ account, chain: base, transport }),
  };
}

function isDelegatedSmartAccount(code: Hex | undefined) {
  return Boolean(code && code !== "0x" && code.toLowerCase().startsWith(DELEGATION_PREFIX));
}

function isInFlightLimitError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /in-flight transaction limit/i.test(message);
}

export async function anchorProofOnChain(input: {
  requestDigest: Hex;
  jobId: Hex;
  delegationHash: Hex;
  proofHash: Hex;
}) {
  if (!adapterEnv.proofRegistry || !adapterEnv.anchorPrivateKey) {
    return { mode: "simulated" as const, transactionHash: null };
  }

  const registry = adapterEnv.proofRegistry as Address;
  const { publicClient, walletClient, account } = createClients();

  const code = await publicClient.getCode({ address: account.address });
  if (isDelegatedSmartAccount(code)) {
    throw new Error(
      `ANCHOR_PRIVATE_KEY (${account.address}) is a MetaMask Smart Account on Base. Base limits in-flight txs for delegated accounts. Use a plain EOA for ANCHOR_PRIVATE_KEY — generate with "cast wallet new", fund ~0.001 ETH on Base, update .env.local, restart dev.`,
    );
  }

  async function waitForPendingClear() {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const [latest, pending] = await Promise.all([
        publicClient.getTransactionCount({ address: account.address }),
        publicClient.getTransactionCount({ address: account.address, blockTag: "pending" }),
      ]);
      if (pending === latest) return;
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }

    throw new Error(
      `Anchor account ${account.address} still has pending Base transactions. Wait a minute, then retry Execute.`,
    );
  }

  async function sendWithRetry(send: () => Promise<Hex>) {
    await waitForPendingClear();

    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        const hash = await send();
        await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
        return hash;
      } catch (error) {
        if (isInFlightLimitError(error) && attempt < 5) {
          await new Promise((resolve) => setTimeout(resolve, 4_000 * (attempt + 1)));
          continue;
        }
        if (isInFlightLimitError(error)) {
          throw new Error(
            `${error instanceof Error ? error.message : String(error)} Use a plain EOA for ANCHOR_PRIVATE_KEY (not a MetaMask Smart Account on Base).`,
          );
        }
        throw error;
      }
    }

    throw new Error("ProofRegistry transaction failed after retries.");
  }

  const alreadyConsumed = await publicClient.readContract({
    address: registry,
    abi: proofRegistryAbi,
    functionName: "consumedRequestDigests",
    args: [input.requestDigest],
  });

  let consumeHash: Hex | null = null;
  if (!alreadyConsumed) {
    consumeHash = await sendWithRetry(() =>
      walletClient.writeContract({
        address: registry,
        abi: proofRegistryAbi,
        functionName: "consumeRequest",
        args: [input.requestDigest],
      }),
    );
  }

  const existingProof = await publicClient.readContract({
    address: registry,
    abi: proofRegistryAbi,
    functionName: "latestProofHashByJob",
    args: [input.jobId],
  });

  if (existingProof !== ZERO_HASH && existingProof === input.proofHash) {
    return {
      mode: "live" as const,
      transactionHash: consumeHash,
      consumeTransactionHash: consumeHash,
      registry,
      note: "Proof already anchored for this job.",
    };
  }

  const anchorHash = await sendWithRetry(() =>
    walletClient.writeContract({
      address: registry,
      abi: proofRegistryAbi,
      functionName: "anchorProof",
      args: [input.jobId, input.delegationHash, input.proofHash],
    }),
  );

  return {
    mode: "live" as const,
    transactionHash: anchorHash,
    consumeTransactionHash: consumeHash,
    registry,
  };
}
