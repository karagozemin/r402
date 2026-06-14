# Demo storyboard

3–4 minute submission video for the MetaMask Smart Accounts Hackathon.

## Audience modes

| Viewer | Wallet | USDC | What they see |
| --- | --- | --- | --- |
| Judge / public demo | Optional | No | **Demo mode** — simulated grant, relay, proof (zero env secrets) |
| Live recording (you) | **MetaMask Flask** (latest, min 13.9+) | **~$0.02** on Base Smart Account | Real ERC-7715 grant, 1Shot relay, ProofRegistry anchor |

Regular MetaMask cannot grant ERC-7715 periodic permissions. Disable the non-Flask MetaMask extension if both are installed.

---

## Scene timeline

| Time | Scene | Screen | Proves |
| --- | --- | --- | --- |
| 0:00–0:20 | Intro | r402 Sentinel intro → dashboard | Product thesis |
| 0:20–0:45 | Permission | MetaMask Flask ERC-7715 periodic USDC prompt (grant **to 1Shot relayer target**) | Qualification gate |
| 0:45–1:10 | Plan | Venice JSON plan + risk note + `venice-live` badge | Venice centrality |
| 1:10–1:35 | Policy tree | Session → Payment → Execution → Proof scopes | Minimum authority |
| 1:35–2:00 | x402 | 402 challenge → paid request → PAYMENT-RESPONSE | x402 track |
| 2:00–2:30 | 1Shot | capabilities → estimate → send → TaskId + Base tx | 1Shot mainnet |
| 2:30–2:50 | Proof | Proof panel artifacts + BaseScan anchor/consume/relay txs | On-chain anchor |
| 2:50–3:10 | Replay test | **Replay exact request** → 409 blocked | Security |
| 3:10–3:30 | Revoke | Revoke root in MetaMask → execution disabled | Fail closed |

---

## Live prerequisites (before recording)

### 1. Wallet

- Install [MetaMask Flask](https://metamask.io/flask) (current releases ~**13.34+**, minimum **13.9+**).
- Switch to **Base** (chain ID 8453).
- Upgrade the connected account to a **Smart Account on Base** (not mainnet-only upgrade).
- Fund the Smart Account with **≥ ~$0.02 USDC** on Base before Execute (~$0.01 relayer fee + ~$0.01 work transfer).

### 2. Env (`.env.local`)

```env
VENICE_API_KEY=
NEXT_PUBLIC_SESSION_ACCOUNT=          # session orchestrator smart account
SESSION_PRIVATE_KEY=                  # session owner key
X402_LIVE=true
ONE_SHOT_LIVE=true
PROOF_REGISTRY_ADDRESS=
NEXT_PUBLIC_PROOF_REGISTRY_ADDRESS=   # same address — for BaseScan links in UI
ANCHOR_PRIVATE_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
ONE_SHOT_WEBHOOK_SECRET=              # optional for webhook demo
BASE_RPC_URL=https://mainnet.base.org
```

### 3. Deploy registry (once)

```bash
npm install
npm run deploy:registry   # Base mainnet — saves address to env
npm run test
npm run test:contracts
npm run dev
```

---

## Required captures

- MetaMask Flask permission popup in the **first 30 seconds** (show grant recipient is 1Shot relayer, not a random EOA)
- Dashboard **Live mode checklist** (Flask + USDC)
- Venice planner badge: `venice-live`
- 1Shot TaskId and relay Base transaction hash
- ProofRegistry consume + anchor BaseScan links
- **Replay exact request** → `409 REPLAY_BLOCKED` (not a bug)
- Revoke in MetaMask → budget $0, execute disabled

---

## Troubleshooting on camera

| Symptom | Fix |
| --- | --- |
| Empty context `0x000…` | Flask only, Smart Account on Base, re-grant |
| `transfer amount exceeds balance` | Add USDC to Smart Account on Base |
| `invalid-execution-length` | Re-grant after code update; bundle must be two USDC transfers |
| `409` on second Execute | Expected — use **Replay** button or change intent and re-plan |
| Two MetaMask extensions | Disable regular MetaMask; keep Flask only |

---

## Commands

```bash
npm run dev          # http://localhost:3000
npm run test         # unit tests
npm run test:contracts
npm run build
npm run lint
```
