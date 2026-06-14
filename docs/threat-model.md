# Threat Model

Sentinel is designed **fail-closed**. Controls below map threats to concrete enforcement points in `@r402/core`, `@r402/adapters`, and the dashboard.

| Threat | Control | Where |
| --- | --- | --- |
| Payment replay | Deterministic `requestDigest` + `IdempotencyGuard` (409 `REPLAY_BLOCKED`) | `packages/core`, `/api/executions` |
| On-chain replay | `ProofRegistry.consumeRequest` reverts if digest already spent | `contracts/`, `proof.ts` |
| Cross-resource substitution | Digest binds method, canonical URL, body, quote, plan, delegation | `createRequestDigest()` |
| Over-broad child agent | Every child budget ≤ root; planner allowlists cap LLM output | `buildDelegationTree()`, `/api/plan` |
| PII in x402 metadata | `sanitizeMetadata()` strips sensitive keys before payment | `@r402/core`, `x402.ts` |
| Stale relay price | Estimate → lock `context` → send within ~45s | `oneshot.ts` |
| Hardcoded relayer target | Grant `to` and bundle validation use `relayer_getCapabilities` `targetAddress` | `metamask.ts`, `oneshot.ts` |
| Empty permission context | Reject `0x000…` grants; preflight Flask + Smart Account on Base | `metamask.ts`, `/api/delegations` |
| Periodic scope bypass | ERC-7715 periodic enforcer requires valid ERC-20 `transfer` calldata per execution leg | MetaMask delegation framework |
| Fake webhook | HMAC verify on `/api/webhooks/oneshot` when secret is set | `webhooks/oneshot/route.ts` |
| Revoked permission reuse | Root revoke disables execution; live revoke via MetaMask in browser | dashboard, `metamask.ts` |
| Simulated tx masquerading as live | BaseScan links only for verified on-chain hashes in manifest | `SentinelDashboard.tsx` |

## Residual risks (demo / hackathon scope)

| Risk | Mitigation path |
| --- | --- |
| In-memory idempotency lost on server restart | Redis or on-chain `consumeRequest` before x402 payment in production |
| Session key compromise | Session key signs redelegation only; root revoke is user MetaMask-only when live |
| LLM plan drift | `constrainPlan()` + allowlists regardless of Venice/Groq output |

Related: [architecture.md](./architecture.md) · [README](../README.md)
