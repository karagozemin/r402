/**
 * Generates a session EOA + MetaMask Hybrid smart account address for r402 Sentinel.
 * Run: npm run generate:session
 * Verify an existing key: npm run generate:session -- --verify 0xYOUR_PRIVATE_KEY
 */
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { Implementation, toMetaMaskSmartAccount } from "@metamask/smart-accounts-kit";

const rpc = process.env.BASE_RPC_URL ?? "https://mainnet.base.org";

async function deriveSessionAccount(privateKey) {
  const owner = privateKeyToAccount(privateKey);
  const client = createPublicClient({ chain: base, transport: http(rpc) });
  const session = await toMetaMaskSmartAccount({
    client,
    implementation: Implementation.Hybrid,
    deployParams: [owner.address, [], [], []],
    deploySalt: "0x",
    signer: { account: owner },
  });
  return { ownerAddress: owner.address, sessionAddress: session.address, privateKey };
}

const verifyArg = process.argv.indexOf("--verify");
const verifyKey = verifyArg >= 0 ? process.argv[verifyArg + 1] : null;

if (verifyArg >= 0 && (!verifyKey || verifyKey.startsWith("-"))) {
  console.error("\nUsage: npm run generate:session -- --verify 0xYOUR_PRIVATE_KEY\n");
  console.error("Put the key on the SAME line after --verify (not on a separate line).\n");
  process.exit(1);
}

const privateKey = verifyKey ?? generatePrivateKey();
const result = await deriveSessionAccount(privateKey);

console.log("\nr402 Sentinel — session account\n");
console.log(`SESSION_PRIVATE_KEY=${result.privateKey}`);
console.log(`NEXT_PUBLIC_SESSION_ACCOUNT=${result.sessionAddress}`);
console.log(`Owner EOA (funds gas if needed): ${result.ownerAddress}`);

if (verifyKey) {
  const expected = process.env.NEXT_PUBLIC_SESSION_ACCOUNT;
  if (expected) {
    const match = expected.toLowerCase() === result.sessionAddress.toLowerCase();
    console.log(`\nMatch with NEXT_PUBLIC_SESSION_ACCOUNT: ${match ? "YES" : "NO"}`);
    if (!match) console.log(`Expected: ${expected}\nDerived:  ${result.sessionAddress}`);
  }
} else {
  console.log("\nCopy both lines into .env.local, then restart: npm run dev");
  console.log("Fund the owner EOA with a little ETH on Base if redelegation txs need gas.\n");
}
