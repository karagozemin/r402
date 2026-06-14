import { createWalletClient, http, type Address, type Hex } from "viem";
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
] as const;

export async function anchorProofOnChain(input: {
  requestDigest: Hex;
  jobId: Hex;
  delegationHash: Hex;
  proofHash: Hex;
}) {
  if (!adapterEnv.proofRegistry || !adapterEnv.anchorPrivateKey) {
    return { mode: "simulated" as const, transactionHash: null };
  }

  const account = privateKeyToAccount(adapterEnv.anchorPrivateKey);
  const client = createWalletClient({
    account,
    chain: base,
    transport: http(adapterEnv.baseRpc),
  });

  const consumeHash = await client.writeContract({
    address: adapterEnv.proofRegistry,
    abi: proofRegistryAbi,
    functionName: "consumeRequest",
    args: [input.requestDigest],
  });

  const anchorHash = await client.writeContract({
    address: adapterEnv.proofRegistry,
    abi: proofRegistryAbi,
    functionName: "anchorProof",
    args: [input.jobId, input.delegationHash, input.proofHash],
  });

  return {
    mode: "live" as const,
    transactionHash: anchorHash,
    consumeTransactionHash: consumeHash,
    registry: adapterEnv.proofRegistry as Address,
  };
}
