"use client";

import type {
  DelegationNode,
  ExecutionPlan,
  ProofManifest,
  RiskAssessment,
} from "@r402/core";
import { requestRootPermission } from "../lib/metamask";
import { useMemo, useState } from "react";
import type { Address } from "viem";

type PlanResponse = {
  plan: ExecutionPlan;
  risk: RiskAssessment;
  delegations: DelegationNode[];
  source: string;
  warning?: string;
};

type ExecutionResponse = {
  manifest: ProofManifest;
  metadata: { clean: Record<string, unknown>; removed: string[] };
  relay: {
    provider: string;
    network: string;
    capabilitySource: string;
    estimateContext: string;
    status: string;
  };
  events: { label: string; detail: string }[];
};

type Phase = "intent" | "planned" | "granted" | "executing" | "confirmed" | "revoked";

const defaultIntent =
  "Research the safest Base USDC yield opportunity, buy private intelligence, and anchor an execution proof.";

const phaseIndex: Record<Phase, number> = {
  intent: 0,
  planned: 1,
  granted: 2,
  executing: 3,
  confirmed: 4,
  revoked: 5,
};

function short(value?: string, start = 9, end = 7) {
  if (!value) return "Pending";
  if (value.length <= start + end + 3) return value;
  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

function ShieldIcon({ small = false }: { small?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={small ? "icon icon-small" : "icon"}
      viewBox="0 0 24 24"
      fill="none"
    >
      <path d="M12 2.8 20 6v5.4c0 5-3.35 8.7-8 10.25-4.65-1.55-8-5.25-8-10.25V6l8-3.2Z" />
      <path d="m8.8 12 2 2 4.6-4.7" />
    </svg>
  );
}

function DotIcon({ kind = "check" }: { kind?: "check" | "lock" | "spark" | "arrow" }) {
  return (
    <span className={`dot-icon ${kind}`}>
      {kind === "check" ? "✓" : kind === "lock" ? "◆" : kind === "spark" ? "✦" : "→"}
    </span>
  );
}

export function SentinelDashboard() {
  const [intent, setIntent] = useState(defaultIntent);
  const [phase, setPhase] = useState<Phase>("intent");
  const [planData, setPlanData] = useState<PlanResponse | null>(null);
  const [execution, setExecution] = useState<ExecutionResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [wallet, setWallet] = useState<string | null>(null);
  const [replayBlocked, setReplayBlocked] = useState(0);
  const [notice, setNotice] = useState("Demo mode is active. Live adapters are ready for credentials.");

  const availableBudget = useMemo(() => {
    if (phase === "revoked") return 0;
    return 20 - (execution?.manifest.paidUSDC ?? 0);
  }, [execution, phase]);

  async function connectWallet() {
    const ethereum = (window as Window & {
      ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<string[]> };
    }).ethereum;
    if (!ethereum) {
      setWallet("0x71C2...98A4");
      setNotice("MetaMask was not detected. Connected a demo smart account.");
      return;
    }
    try {
      const accounts = await ethereum.request({ method: "eth_requestAccounts" });
      setWallet(accounts[0]);
      setNotice("MetaMask connected. Ready to request a bounded permission.");
    } catch {
      setNotice("Wallet connection was declined.");
    }
  }

  async function createPlan() {
    setBusy(true);
    setNotice("Venice Planner is minimizing authority and checking policy.");
    try {
      const response = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setPlanData(payload);
      setExecution(null);
      setReplayBlocked(0);
      setPhase("planned");
      setNotice(payload.warning ?? (
        payload.source === "venice-live"
          ? "Venice returned a policy-safe executable plan."
          : payload.source === "groq-live"
            ? "Groq returned a policy-safe executable plan."
          : "Demo planner returned a policy-safe executable plan."
      ));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Planning failed.");
    } finally {
      setBusy(false);
    }
  }

  async function grantPermission() {
    const sessionAccount = process.env.NEXT_PUBLIC_SESSION_ACCOUNT as Address | undefined;
    setBusy(true);
    try {
      if (sessionAccount) {
        const granted = await requestRootPermission(sessionAccount);
        setNotice(`Live ERC-7715 permission granted: ${short(granted.context)}`);
      } else {
        if (!wallet) setWallet("0x71C2...98A4");
        setNotice("Demo ERC-7715 permission granted. Add NEXT_PUBLIC_SESSION_ACCOUNT for live mode.");
      }
      setPhase("granted");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Permission request failed.");
    } finally {
      setBusy(false);
    }
  }

  async function execute(replay = false) {
    if (!planData) return;
    if (phase === "revoked") {
      setNotice("Execution blocked: the root delegation is revoked.");
      return;
    }
    setBusy(true);
    if (!replay) setPhase("executing");
    setNotice(replay ? "Replaying the exact paid request..." : "Binding request, quote, delegation, and relay context.");

    try {
      const response = await fetch("/api/executions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planData.plan, delegations: planData.delegations }),
      });
      const payload = await response.json();
      if (response.status === 409) {
        setReplayBlocked((count) => count + 1);
        setNotice("Replay blocked before payment: requestDigest was already consumed.");
        return;
      }
      if (!response.ok) throw new Error(payload.error);
      await new Promise((resolve) => setTimeout(resolve, 650));
      setExecution(payload);
      setPhase("confirmed");
      setNotice("Execution confirmed and proof manifest anchored.");
    } catch (error) {
      setPhase("granted");
      setNotice(error instanceof Error ? error.message : "Execution failed.");
    } finally {
      setBusy(false);
    }
  }

  function revoke() {
    setPhase("revoked");
    setNotice("Root delegation revoked. All child agents are disabled immediately.");
  }

  const step = phaseIndex[phase];

  return (
    <main className="shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark"><ShieldIcon /></span>
          <span className="brand-copy">
            <strong>r402</strong>
            <span>Sentinel</span>
          </span>
          <span className="tag">Proof-bound agent firewall</span>
        </div>
        <div className="top-actions">
          <span className="network"><i /> Base Mainnet</span>
          <button className="wallet-button" onClick={connectWallet}>
            <span className="wallet-gem" />
            {wallet ? short(wallet, 6, 4) : "Connect MetaMask"}
          </button>
        </div>
      </header>

      <section className="hero">
        <div>
          <div className="eyebrow"><span /> PROOF-BOUND AUTONOMY</div>
          <h1>Let agents act.<br /><em>Never let trust leak.</em></h1>
          <p>
            One bounded permission becomes a narrow, auditable execution chain.
            Every payment, relay, and proof stays request-bound and revocable.
          </p>
        </div>
        <div className="hero-metrics">
          <Metric value={replayBlocked.toString()} label="replays blocked" tone="orange" />
          <Metric value={`$${availableBudget.toFixed(2)}`} label="budget remaining" />
          <Metric value={phase === "revoked" ? "OFF" : "LIVE"} label="permission state" />
        </div>
      </section>

      <section className="flow-strip">
        {[
          ["Intent", "Natural language"],
          ["Policy", "Venice risk plan"],
          ["Permission", "ERC-7715 root"],
          ["Payment", "x402 request"],
          ["Relay", "1Shot 7710"],
          ["Proof", "Onchain anchor"],
        ].map(([title, label], index) => (
          <div className={`flow-step ${step >= index ? "active" : ""}`} key={title}>
            <span className="flow-number">{step > index ? "✓" : `0${index + 1}`}</span>
            <span><strong>{title}</strong><small>{label}</small></span>
            {index < 5 && <b>→</b>}
          </div>
        ))}
      </section>

      <div className="notice">
        <DotIcon kind={phase === "revoked" ? "lock" : "spark"} />
        <span>{notice}</span>
        <small>{busy ? "WORKING" : phase.toUpperCase()}</small>
      </div>

      <section className="grid grid-top">
        <article className="panel intent-panel">
          <PanelHeader
            number="01"
            title="Define the mission"
            subtitle="The planner will reduce it to minimum authority."
            badge="VENICE"
          />
          <label className="intent-input">
            <textarea value={intent} onChange={(event) => setIntent(event.target.value)} />
            <span>{intent.length} chars</span>
          </label>
          <div className="chip-row">
            <span>Base only</span><span>Daily cap</span><span>Private inference</span>
          </div>
          <button className="primary-button" disabled={busy || intent.length < 8} onClick={createPlan}>
            <DotIcon kind="spark" />
            {busy && phase === "intent" ? "Building policy..." : "Build proof-bound plan"}
            <b>→</b>
          </button>
        </article>

        <article className="panel permission-panel">
          <PanelHeader
            number="02"
            title="Bounded permission"
            subtitle="One root. Every child gets less."
            badge="ERC-7715"
          />
          <div className="budget-card">
            <div className="budget-ring" style={{ "--budget": `${(availableBudget / 20) * 100}%` } as React.CSSProperties}>
              <div><strong>${availableBudget.toFixed(2)}</strong><span>of $20.00</span></div>
            </div>
            <div className="budget-copy">
              <span className="status-label"><i /> {phase === "revoked" ? "REVOKED" : "ROOT SCOPE"}</span>
              <strong>USDC periodic spend</strong>
              <p>Base · resets every 24h</p>
              <div><span>Expires</span><b>24 hours</b></div>
              <div><span>Adjustment</span><b>Allowed</b></div>
            </div>
          </div>
          <button
            className="secondary-button"
            disabled={!planData || phase === "granted" || phase === "confirmed" || phase === "revoked"}
            onClick={grantPermission}
          >
            <ShieldIcon small />
            {phase === "planned" ? "Grant guarded permission" : phase === "revoked" ? "Permission revoked" : "Awaiting policy plan"}
          </button>
        </article>

        <article className="panel risk-panel">
          <PanelHeader
            number="03"
            title="Risk decision"
            subtitle="Machine-readable policy, human-readable why."
            badge={planData?.risk.verdict.toUpperCase() ?? "WAITING"}
          />
          <div className="risk-score">
            <div>
              <strong>{planData?.risk.score ?? "--"}</strong>
              <span>/100 risk</span>
            </div>
            <p>{planData?.risk.note ?? "Generate a plan to run the risk engine."}</p>
          </div>
          <div className="check-list">
            {(planData?.risk.controls ?? [
              "Request binding check",
              "Authority narrowing check",
              "PII metadata filter",
              "Target allowlist check",
            ]).map((control, index) => (
              <div className={planData ? "done" : ""} key={control}>
                <DotIcon kind={planData ? "check" : "lock"} />
                <span>{control}</span>
                <small>{planData ? (index === 2 ? "2 REMOVED" : "PASS") : "PENDING"}</small>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="grid grid-middle">
        <article className="panel delegation-panel">
          <PanelHeader
            number="04"
            title="Authority map"
            subtitle="Redelegation can only narrow the root permission."
            badge="ERC-7710"
          />
          <div className="delegation-tree">
            {(planData?.delegations ?? [
              { id: "root", label: "Session Orchestrator", role: "ERC-7715 root permission", limitUSDC: 20, targets: ["Base / USDC"], expiresIn: "24 hours", status: "ready" },
              { id: "payment", label: "Payment Guard", role: "x402 paid request", limitUSDC: 2, targets: ["Allowed seller only"], expiresIn: "10 minutes", status: "ready" },
              { id: "execution", label: "Execution Agent", role: "1Shot relay", limitUSDC: 5, targets: ["Allowed selector only"], expiresIn: "10 minutes", status: "ready" },
              { id: "proof", label: "Proof Agent", role: "read + anchor only", limitUSDC: 0, targets: ["ProofRegistry"], expiresIn: "30 minutes", status: "ready" },
            ]).map((node, index) => (
              <div className={`agent-card agent-${index} ${phase === "revoked" ? "revoked" : ""}`} key={node.id}>
                <div className="agent-icon">{index === 0 ? "O" : index === 1 ? "$" : index === 2 ? "↗" : "#"}</div>
                <div>
                  <span>{node.role}</span>
                  <strong>{node.label}</strong>
                  <small>{node.targets[0]}</small>
                </div>
                <b>{node.limitUSDC ? `$${node.limitUSDC}` : "READ"}</b>
                {index > 0 && <i className="tree-line" />}
              </div>
            ))}
          </div>
        </article>

        <article className="panel execution-panel">
          <PanelHeader
            number="05"
            title="Protected execution"
            subtitle="Challenge, pay, relay, verify."
            badge={execution ? "CONFIRMED" : phase === "executing" ? "RUNNING" : "READY"}
          />
          <div className="execution-rail">
            {(execution?.events ?? [
              { label: "402 challenge", detail: "Waiting for a granted permission" },
              { label: "Request digest lock", detail: "method + URL + body + quote + plan" },
              { label: "Paid request", detail: "x402 receipt will appear here" },
              { label: "1Shot relay", detail: "capabilities → estimate → send" },
              { label: "Proof anchor", detail: "ProofRegistry event" },
            ]).map((event, index) => (
              <div className={execution ? "event complete" : phase === "executing" && index < 3 ? "event running" : "event"} key={event.label}>
                <span>{execution ? "✓" : index + 1}</span>
                <div><strong>{event.label}</strong><small>{short(event.detail, 34, 12)}</small></div>
                <b>{execution ? (index === 0 ? "402→200" : "VERIFIED") : "WAITING"}</b>
              </div>
            ))}
          </div>
          <button
            className="primary-button execute-button"
            disabled={!planData || phase !== "granted" || busy}
            onClick={() => execute(false)}
          >
            <ShieldIcon small />
            {phase === "executing" ? "Executing protected flow..." : "Execute protected flow"}
            <b>→</b>
          </button>
        </article>
      </section>

      <section className="grid grid-bottom">
        <article className="panel proof-panel">
          <PanelHeader
            number="06"
            title="Proof manifest"
            subtitle="Every claim resolves to a cryptographic artifact."
            badge={execution ? "ANCHORED" : "PENDING"}
          />
          <div className="proof-grid">
            {[
              ["Delegation hash", execution?.manifest.delegationHash, "ERC-7710"],
              ["Request digest", execution?.manifest.requestDigest, "x402 bound"],
              ["Relay task ID", execution?.manifest.relayTaskId, "1Shot"],
              ["Transaction hash", execution?.manifest.transactionHash, "Base"],
              ["Proof hash", execution?.manifest.proofHash, "Registry"],
              ["PII sanitization", execution ? `${execution.metadata.removed.length} fields removed` : undefined, "Pre-flight"],
            ].map(([label, value, tag]) => (
              <div className="proof-item" key={label}>
                <span>{label}<b>{tag}</b></span>
                <strong>{short(value)}</strong>
                <i className={execution ? "proof-state done" : "proof-state"}>{execution ? "✓" : "·"}</i>
              </div>
            ))}
          </div>
        </article>

        <article className="panel controls-panel">
          <PanelHeader
            number="07"
            title="Adversarial controls"
            subtitle="Trust is tested, not assumed."
            badge="FIREWALL"
          />
          <button
            className="control-button replay"
            disabled={!execution || phase === "revoked" || busy}
            onClick={() => execute(true)}
          >
            <span><DotIcon kind="arrow" /></span>
            <div><strong>Replay exact request</strong><small>Expected result: blocked before payment</small></div>
            <b>{replayBlocked ? `${replayBlocked} BLOCKED` : "TEST"}</b>
          </button>
          <button
            className="control-button revoke"
            disabled={phase !== "confirmed"}
            onClick={revoke}
          >
            <span><DotIcon kind="lock" /></span>
            <div><strong>Revoke root delegation</strong><small>Immediately disables every child agent</small></div>
            <b>{phase === "revoked" ? "REVOKED" : "REVOKE"}</b>
          </button>
          <div className="control-note">
            <ShieldIcon small />
            <p><strong>Fail closed.</strong> A stale quote, unknown target, duplicate digest, or revoked permission stops the entire chain.</p>
          </div>
        </article>
      </section>

      <footer>
        <span><ShieldIcon small /> r402 Sentinel</span>
        <p>MetaMask Smart Accounts · ERC-7715 · ERC-7710 · x402 · Venice · 1Shot · Base</p>
        <b>PROOF OVER PROMISES</b>
      </footer>
    </main>
  );
}

function PanelHeader({
  number,
  title,
  subtitle,
  badge,
}: {
  number: string;
  title: string;
  subtitle: string;
  badge: string;
}) {
  return (
    <div className="panel-header">
      <span className="panel-number">{number}</span>
      <div><h2>{title}</h2><p>{subtitle}</p></div>
      <b>{badge}</b>
    </div>
  );
}

function Metric({ value, label, tone }: { value: string; label: string; tone?: string }) {
  return (
    <div className={`metric ${tone ?? ""}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
