# Threat Model

| Threat | Control |
| --- | --- |
| Payment replay | Deterministic request digest plus idempotency guard |
| Cross-resource substitution | Bind method, canonical URL, body, quote, plan, and delegation |
| Over-broad child agent | Build every child scope below the root budget and target set |
| PII in x402 metadata | Remove sensitive keys before payment |
| Stale relay price | Use estimate context immediately before send |
| Hardcoded relayer target | Read `targetAddress` from `relayer_getCapabilities` |
| Fake webhook | Verify 1Shot webhook signature before terminal status |
| Revoked permission reuse | Disable the root delegation and fail closed |
