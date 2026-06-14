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

function createClients() {
  const account = privateKeyToAccount(adapterEnv.anchorPrivateKey!);
  const transport = http(adapterEnv.baseRpc);
  return {
    account,
    publicClient: createPublicClient({ chain: base, transport }),
    walletClient: createWalletClient({ account, chain: base, transport }),
  };
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

  try {
    const { publicClient, walletClient } = createClients();

    const alreadyConsumed = await publicClient.readContract({
      address: registry,
      abi: proofRegistryAbi,
      functionName: "consumedRequestDigests",
      args: [input.requestDigest],
    });

    let consumeHash: Hex | null = null;
    if (!alreadyConsumed) {
      consumeHash = await walletClient.writeContract({
        address: registry,
        abi: proofRegistryAbi,
        functionName: "consumeRequest",
        args: [input.requestDigest],
      });
      await publicClient.waitForTransactionReceipt({ hash: consumeHash });
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

    const anchorHash = await walletClient.writeContract({
      address: registry,
      abi: proofRegistryAbi,
      functionName: "anchorProof",
      args: [input.jobId, input.delegationHash, input.proofHash],
    });
    await publicClient.waitForTransactionReceipt({ hash: anchorHash });

    return {
      mode: "live" as const,
      transactionHash: anchorHash,
      consumeTransactionHash: consumeHash,
      registry,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Proof anchor failed";
    return {
      mode: "simulated" as const,
      transactionHash: null,
      warning: message,
      registry,
    };
  }
}
