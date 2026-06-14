<p align="center">
  <img src="r402.png" alt="r402" width="200" />
</p>

<h1 align="center">r402 Sentinel</h1>

<p align="center">
  <strong>Proof-bound agent firewall for MetaMask Smart Accounts.</strong><br />
  One bounded permission. Narrow child agents. Every payment tied to the exact request.
</p>

<p align="center">
  <a href="docs/architecture.md"><strong>Architecture</strong></a> ·
  <a href="docs/threat-model.md">Threat Model</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#demo-flow">Demo Flow</a> ·
  <a href="#live-prerequisites">Live Prerequisites</a>
</p>

---

## The problem

Autonomous agents need to spend money, call contracts, and buy data. Most stacks solve this with a hot wallet, a broad API key, or a vague "trust the bot" policy. That fails the moment an agent replays a payment, swaps a target contract, leaks PII into x402 metadata, or keeps acting after the user revokes access.

**r402 Sentinel** treats agent autonomy as a *permission problem*, not a prompt problem. The user grants one root budget. The orchestrator narrows it. Every paid request is cryptographically bound to the plan, quote, and delegation that authorized it. Replay, substitution, and over-broad scope are blocked before money moves.

## What it does

| Layer | Responsibility |
| --- | --- |
| **Planner** | Venice (or Groq fallback) turns natural-language intent into a minimum-authority `ExecutionPlan` |
| **Policy engine** | Scores risk, enforces seller allowlists, and rejects over-broad budgets |
| **Permission tree** | ERC-7715 root → ERC-7710 child agents (Payment, Execution, Proof) — each narrower than its parent |
| **Payment guard** | x402 request digest binds method, URL, body, quote, plan, and delegation |
| **Relay adapter** | 1Shot capabilities → estimate → send (7710 bundle on Base) |
| **Proof anchor** | `ProofRegistry` consumes the digest once and stores an auditable proof hash |

The core invariant:

> **No child receives more authority than its parent. No paid request can be detached from the exact quote, plan, or delegation that authorized it.**

For the full system design — component boundaries, data flows, hash construction, and live vs demo adapters — see **[Architecture](docs/architecture.md)**.

---

## Architecture at a glance

```text
User intent
  → Venice Planner + Risk Policy          (@r402/core)
  → ERC-7715 root periodic USDC permission (MetaMask Flask → 1Shot relayer target)
  → Session Orchestrator (policy tree)
       → Payment Guard   : x402 seller · ≤ $2 · 10 min
       → Execution Agent : 1Shot relay · ≤ $5
       → Proof Agent     : ProofRegistry anchor only
  → requestDigest(method, URL, body, quote, plan, delegation)
  → idempotency lock
  → x402 paid request
  → 1Shot getCapabilities · estimate · send (fee + work USDC transfers)
  → ProofRegistry.consumeRequest + anchorProof
  → revoke root permission (MetaMask)
```

**Read the deep dive:** [docs/architecture.md](docs/architecture.md)

---

## Monorepo layout

```text
r402/
├── apps/web/                  Next.js 16 dashboard + API routes
│   ├── app/api/plan/          Venice / Groq planner endpoint
│   ├── app/api/executions/    x402 binding, idempotency, proof manifest
│   ├── app/api/delegations/   ERC-7710 redelegation (or policy tree when ONE_SHOT_LIVE)
│   ├── components/            SentinelDashboard UI
│   └── lib/metamask.ts        Live ERC-7715 permission request
├── packages/core/             Policy, hashing, delegation tree, idempotency
├── packages/adapters/         Live Venice, x402, 1Shot, ProofRegistry, ERC-7710
├── contracts/                 ProofRegistry.sol (Foundry)
├── docs/
│   ├── architecture.md        System design (start here for internals)
│   ├── threat-model.md        Threat → control mapping
│   └── demo-storyboard.md     Hackathon video script + live checklist
└── tests/e2e/                 Playwright end-to-end demo flow
```

---

## Quick start

**Requirements:** Node.js 20+, npm 10+. Optional: Foundry (contract tests), MetaMask Flask (live ERC-7715 only).

```bash
git clone <repo-url> r402 && cd r402
npm install
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)**. With an empty `.env.local`, the complete demo flow runs with **zero credentials** — no wallet, no USDC, no Flask.

Root `.env.local` is loaded automatically by the web app (`apps/web/next.config.ts`).

---

## Configuration

| Variable | Required | Description |
| --- | --- | --- |
| `VENICE_API_KEY` | No | Enable live Venice planner inference |
| `VENICE_MODEL` | No | Default: `venice-uncensored-1-2` |
| `GROQ_API_KEY` | No | Free fallback if Venice is unavailable |
| `GROQ_MODEL` | No | Default: `openai/gpt-oss-20b` |
| `NEXT_PUBLIC_SESSION_ACCOUNT` | No | Session orchestrator smart account (7710 signing + 1Shot work-transfer recipient) |
| `SESSION_PRIVATE_KEY` | No | Session owner key for ERC-7710 redelegation signing |
| `X402_LIVE` | No | Enable live x402 payment attempts (`true` / `false`) |
| `ONE_SHOT_LIVE` | No | Enable live 1Shot relay estimate + send |
| `ONE_SHOT_RELAYER_URL` | No | Default: `https://relayer.1shotapi.com/relayers` |
| `ONE_SHOT_WEBHOOK_SECRET` | No | HMAC secret for `/api/webhooks/oneshot` |
| `PROOF_REGISTRY_ADDRESS` | No | Deployed `ProofRegistry` on Base |
| `NEXT_PUBLIC_PROOF_REGISTRY_ADDRESS` | No | Same address — BaseScan links in dashboard |
| `ANCHOR_PRIVATE_KEY` | No | Key that calls `consumeRequest` + `anchorProof` |
| `DEPLOYER_PRIVATE_KEY` | No | One-time deploy key for `npm run deploy:registry` |
| `BASE_RPC_URL` | No | Default: `https://mainnet.base.org` |
| `NEXT_PUBLIC_APP_URL` | No | Public app URL for 1Shot webhook callbacks |
| `NEXT_PUBLIC_BASE_EXPLORER` | No | Default: `https://basescan.org` |

**Planner fallback chain:** Venice live → Groq live → deterministic demo plan.

**Permission modes:**

| Mode | Env | Wallet | Behavior |
| --- | --- | --- | --- |
| **Demo** (default) | Empty or live flags off | Optional | Simulated grant, relay, proof |
| **Live grant** | `NEXT_PUBLIC_SESSION_ACCOUNT` | MetaMask Flask on Base | Real ERC-7715 periodic USDC grant |
| **Live execution** | `X402_LIVE`, `ONE_SHOT_LIVE`, registry + anchor keys | Flask + Smart Account + USDC | Real x402, 1Shot, ProofRegistry |

Copy `.env.example` to `.env.local` and fill in what you need.

---

## Live prerequisites

For **you** (live recording or dogfooding). **Visitors in demo mode need none of this.**

| Requirement | Details |
| --- | --- |
| **MetaMask Flask** | Latest release (e.g. **13.34+**). Minimum **13.9+** for `erc20-token-periodic`. Regular MetaMask is **not** sufficient. |
| **One extension** | Disable regular MetaMask if Flask is installed — two extensions break grant flows. |
| **Base Smart Account** | Upgrade on **Base** (8453), not mainnet-only. |
| **USDC on Base** | **≥ ~$0.02** in the connected Smart Account before Execute (~$0.01 relayer fee + ~$0.01 work transfer). Grant sets limits only — it does not fund the fee. |
| **Grant recipient** | MetaMask delegates **to the 1Shot relayer `targetAddress`** from `relayer_getCapabilities` — required for relay redemption. |
| **Registry** | Deploy once: `npm run deploy:registry` → set `PROOF_REGISTRY_ADDRESS` + `NEXT_PUBLIC_PROOF_REGISTRY_ADDRESS`. |

The dashboard shows a **Live mode checklist** when `NEXT_PUBLIC_SESSION_ACCOUNT` and `ONE_SHOT_LIVE` are enabled.

Full recording script: **[docs/demo-storyboard.md](docs/demo-storyboard.md)**

---

## Hackathon readiness

| Track / requirement | Status |
| --- | --- |
| Venice planner + risk agent + web search | ✅ Wired (`@r402/adapters`) |
| ERC-7715 root permission (MetaMask Flask) | ✅ `lib/metamask.ts` + dashboard grant |
| ERC-7710 redelegation tree | ✅ `/api/delegations` (skipped when `ONE_SHOT_LIVE` — direct 1Shot grant) |
| x402 request binding + PII filter | ✅ `@r402/core` + `@r402/adapters/x402` |
| 1Shot relay (capabilities → estimate → send) | ✅ `@r402/adapters/oneshot` |
| 1Shot webhook HMAC verify | ✅ `/api/webhooks/oneshot` |
| ProofRegistry contract + tests | ✅ Foundry 3/3 |
| On-chain anchor adapter | ✅ `proof.ts` |
| Replay block + revoke | ✅ IdempotencyGuard + MetaMask revoke |
| Dashboard end-to-end demo | ✅ Plan → grant → execute → replay → revoke |
| Unit tests + build + lint | ✅ `npm test`, `npm run build`, `npm run lint` |
| Architecture + threat model + demo storyboard | ✅ `docs/` |
| E2E spec | ✅ Playwright spec (install browsers to run) |

---

## Demo flow

Walk through the dashboard in order:

1. **Build a minimum-authority plan** — enter intent, run the Venice policy planner.
2. **Grant the root permission** — demo: simulated scope; live: MetaMask Flask periodic USDC on Base.
3. **Inspect the authority map** — Payment Guard, Execution Agent, Proof Agent — each narrower than the root.
4. **Execute the protected flow** — x402 binding → 1Shot relay → proof manifest.
5. **Replay the exact request** — idempotency guard returns `409 REPLAY_BLOCKED` (intentional).
6. **Revoke the root** — live: MetaMask on-chain revoke; demo: simulated disable.

**409 on Execute** after a successful run is expected — same `requestDigest` cannot run twice. Change the intent and re-plan for a fresh run.

---

## Verification

```bash
npm test              # @r402/core + @r402/adapters unit tests
npm run test:e2e      # Playwright: plan → grant → execute → replay block → revoke
npm run test:contracts # Foundry: ProofRegistry consume + anchor
npm run build         # Production build
npm run lint          # TypeScript check
npm run deploy:registry  # Deploy ProofRegistry to Base (once)
```

---

## Security

Sentinel is designed **fail-closed**: stale quotes, unknown targets, duplicate digests, revoked permissions, and over-broad child scopes stop the chain before payment.

| Threat | Control |
| --- | --- |
| Payment replay | Deterministic `requestDigest` + `IdempotencyGuard` |
| Cross-resource substitution | Bind method, URL, body, quote, plan, delegation |
| Over-broad child agent | Every child budget ≤ parent; targets narrowed per role |
| PII in x402 metadata | `sanitizeMetadata()` strips sensitive keys pre-flight |
| Revoked permission reuse | Root revocation disables all children |
| Empty ERC-7715 context | Reject `0x000…`; require Flask + Smart Account on Base |

Full threat model: **[docs/threat-model.md](docs/threat-model.md)**

---

## Tech stack

- **Runtime:** Next.js 16, React 19, TypeScript
- **Chain:** Base (chain ID 8453), viem, MetaMask Smart Accounts Kit (ERC-7715 / 7710)
- **Inference:** Venice AI, Groq (structured JSON fallback)
- **Payments:** x402 request binding
- **Relay:** 1Shot public relayer (7710 bundles, USDC fee on Base)
- **Contracts:** Solidity 0.8.24, Foundry
- **Core logic:** `@r402/core` — canonical hashing, policy, delegation tree, proof manifest

---

## Live integration boundaries

| Boundary | File | Responsibility |
| --- | --- | --- |
| Adapters | `packages/adapters/src/` | Venice, x402, 1Shot, ProofRegistry, ERC-7710 |
| Planner | `apps/web/app/api/plan/route.ts` | Venice / Groq → constrained `ExecutionPlan` |
| Redelegation | `apps/web/app/api/delegations/route.ts` | Signed 7710 bundles, or policy tree when `ONE_SHOT_LIVE` |
| Execution | `apps/web/app/api/executions/route.ts` | Digest lock, x402, relay, proof manifest |
| Revoke / budget | `apps/web/app/api/revoke`, `budget/` | On-chain disable + caveat budget read |
| Webhook | `apps/web/app/api/webhooks/oneshot/` | 1Shot HMAC verification |
| Policy & crypto | `packages/core/src/index.ts` | Hashing, risk, delegation tree, PII filter |
| Permissions | `apps/web/lib/metamask.ts` | ERC-7715 grant to 1Shot relayer target |
| Onchain proof | `contracts/src/ProofRegistry.sol` | One-time digest consumption + proof anchor |

Demo storyboard: **[docs/demo-storyboard.md](docs/demo-storyboard.md)**

---

<p align="center"><strong>Proof over promises.</strong></p>
