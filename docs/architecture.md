# Architecture

```text
User intent
  -> Venice Planner + Risk Policy
  -> ERC-7715 root periodic USDC permission
  -> Session Orchestrator
       -> Payment Guard: x402 seller + 2 USDC + 10 minute scope
       -> Execution Agent: 1Shot target + 5 USDC + selector scope
       -> Proof Agent: read and ProofRegistry anchor only
  -> requestDigest(method, URL, body, quote, plan, delegation)
  -> idempotency lock
  -> x402 paid request
  -> 1Shot capabilities, estimate, send
  -> ProofRegistry consumeRequest + anchorProof
  -> revoke root permission
```

The invariant is simple: no child can receive more authority than its parent,
and no paid request can be detached from the exact quote, plan, or delegation
that authorized it.
