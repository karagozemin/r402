# Demo storyboard

3–4 minute submission video for MetaMask Smart Accounts Hackathon.

| Time | Scene | Screen | Proves |
| --- | --- | --- | --- |
| 0:00–0:20 | Intro | r402 Sentinel intro → dashboard | Product thesis |
| 0:20–0:45 | Permission | MetaMask ERC-7715 periodic USDC prompt | Qualification gate |
| 0:45–1:10 | Plan | Venice JSON plan + risk note + web search citation | Venice centrality |
| 1:10–1:35 | Redelegation | Session → Payment → Execution → Proof tree | ERC-7710 / A2A |
| 1:35–2:00 | x402 | 402 challenge → paid request → PAYMENT-RESPONSE | x402 track |
| 2:00–2:30 | 1Shot | capabilities → estimate → send → TaskId | 1Shot mainnet |
| 2:30–2:50 | Proof | Click proof artifacts + BaseScan tx | On-chain anchor |
| 2:50–3:10 | Replay test | Replay exact request → blocked | Security |
| 3:10–3:30 | Revoke | Revoke root → execution fails | Fail closed |

## Required captures

- MetaMask permission popup (first 30 seconds)
- Venice planner source badge: `venice-live`
- 1Shot TaskId and Base transaction hash
- ProofRegistry `ProofAnchored` event or explorer link
- Revoke blocking a subsequent execution

## Env for live demo

```env
VENICE_API_KEY=
NEXT_PUBLIC_SESSION_ACCOUNT=
SESSION_PRIVATE_KEY=
X402_LIVE=true
ONE_SHOT_LIVE=true
PROOF_REGISTRY_ADDRESS=
ANCHOR_PRIVATE_KEY=
ONE_SHOT_WEBHOOK_SECRET=
NEXT_PUBLIC_APP_URL=https://your-app.example
```

## Commands before recording

```bash
npm install
npm run deploy:registry   # once, Base mainnet
npm run test
npm run test:contracts
npm run dev
```
