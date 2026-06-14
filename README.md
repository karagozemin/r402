<p align="center">
  <img src="r402.png" alt="r402" width="200" />
</p>

# r402 Sentinel

Proof-bound agent firewall for MetaMask Smart Accounts. A user grants one bounded
ERC-7715 permission; the orchestrator narrows it into ERC-7710 child delegations,
binds an x402 payment to the exact request, relays execution through 1Shot, and
anchors the final proof manifest.

## Run it

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. No credentials are required for the complete demo
flow. Root `.env.local` is loaded by the web app. Add `VENICE_API_KEY` to switch
the planner to Venice live inference. If Venice is unavailable, `GROQ_API_KEY`
enables the free Groq fallback before the deterministic fallback. Add
`NEXT_PUBLIC_SESSION_ACCOUNT` to make the
grant button invoke MetaMask's live ERC-7715 periodic USDC permission prompt.

## Demo flow

1. Build a minimum-authority plan.
2. Grant the simulated periodic USDC root permission.
3. Inspect narrower Payment, Execution, and Proof agent scopes.
4. Execute the protected x402 and 1Shot flow.
5. Replay the exact request and observe the idempotency block.
6. Revoke the root and disable every child agent.

## Verification

```bash
npm test
npm run test:e2e
npm run test:contracts
npm run build
```

## Live integration boundaries

- `apps/web/app/api/plan/route.ts`: Venice OpenAI-compatible planner.
- `apps/web/app/api/executions/route.ts`: x402 request binding, nonce lock, relay
  adapter boundary, and proof manifest.
- `packages/core`: policy validation, authority narrowing, metadata sanitization,
  and deterministic hashing.
- `contracts/src/ProofRegistry.sol`: replay consumption and proof anchoring.

The browser demo intentionally labels simulated artifacts. Before submission,
wire the granted permission context, signed 7710 bundle, live 1Shot task, and
deployed ProofRegistry address into the existing adapter boundaries.
