"use client";

import type {
  DelegationNode,
  ExecutionPlan,
  ProofManifest,
  RiskAssessment,
} from "@r402/core";
import logo from "../../../r402.png";
import { ToastStack, useToasts } from "./ToastStack";
import { requestRootPermission } from "../lib/metamask";
import Image from "next/image";
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

type NoticeTone = "info" | "success" | "error" | "warning";

const explorerBase =
  process.env.NEXT_PUBLIC_BASE_EXPLORER ?? "https://basescan.org";

function noticeToneFor(message: string, phase: Phase): NoticeTone {
  if (message.includes("Replay blocked")) return "warning";
  if (message.includes("failed") || message.includes("declined") || message.includes("blocked")) {
    return "error";
  }
  if (phase === "confirmed" || message.includes("granted") || message.includes("confirmed") || message.includes("connected")) {
    return "success";
  }
  if (message.includes("warning") || message.includes("Demo")) return "info";
  return "info";
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

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
  const [copiedProofKey, setCopiedProofKey] = useState<string | null>(null);
  const { toasts, push: pushToast, dismiss: dismissToast } = useToasts();

  const noticeTone = noticeToneFor(notice, phase);

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
      pushToast({ tone: "info", title: "Demo wallet connected", message: "MetaMask not found — using a simulated account." });
      return;
    }
    try {
      const accounts = await ethereum.request({ method: "eth_requestAccounts" });
      setWallet(accounts[0]);
      setNotice("MetaMask connected. Ready to request a bounded permission.");
      pushToast({ tone: "success", title: "Wallet connected", message: short(accounts[0], 8, 6) });
    } catch {
      setNotice("Wallet connection was declined.");
      pushToast({ tone: "error", title: "Connection declined", message: "Approve the request in MetaMask to continue." });
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
      const noticeText = payload.warning ?? (
        payload.source === "venice-live"
          ? "Venice returned a policy-safe executable plan."
          : payload.source === "groq-live"
            ? "Groq returned a policy-safe executable plan."
          : "Demo planner returned a policy-safe executable plan."
      );
      setNotice(noticeText);
      pushToast({
        tone: "success",
        title: "Plan ready",
        message: `${payload.risk.verdict.toUpperCase()} · score ${payload.risk.score}/100 · ${payload.delegations.length} agent scopes`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Planning failed.";
      setNotice(message);
      pushToast({ tone: "error", title: "Planning failed", message });
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
        pushToast({ tone: "success", title: "Permission granted", message: "Live ERC-7715 root scope is active on Base." });
      } else {
        if (!wallet) setWallet("0x71C2...98A4");
        setNotice("Demo ERC-7715 permission granted. Add NEXT_PUBLIC_SESSION_ACCOUNT for live mode.");
        pushToast({ tone: "success", title: "Permission granted", message: "Demo root scope unlocked — you can execute the flow." });
      }
      setPhase("granted");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Permission request failed.";
      setNotice(message);
      pushToast({ tone: "error", title: "Permission failed", message });
    } finally {
      setBusy(false);
    }
  }

  async function execute(replay = false) {
    if (!planData) return;
    if (phase === "revoked") {
      setNotice("Execution blocked: the root delegation is revoked.");
      pushToast({ tone: "error", title: "Execution blocked", message: "Revoke is active — all child agents are disabled." });
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
        pushToast({
          tone: "warning",
          title: "Replay blocked",
          message: "The request digest was already consumed — no duplicate payment.",
        });
        return;
      }
      if (!response.ok) throw new Error(payload.error);
      await new Promise((resolve) => setTimeout(resolve, 650));
      setExecution(payload);
      setPhase("confirmed");
      setNotice("Execution confirmed and proof manifest anchored.");
      pushToast({
        tone: "success",
        title: "Execution confirmed",
        message: `$${payload.manifest.paidUSDC} paid · proof anchored · click artifacts below to copy`,
      });
    } catch (error) {
      setPhase("granted");
      const message = error instanceof Error ? error.message : "Execution failed.";
      setNotice(message);
      pushToast({ tone: "error", title: "Execution failed", message });
    } finally {
      setBusy(false);
    }
  }

  function revoke() {
    setPhase("revoked");
    setNotice("Root delegation revoked. All child agents are disabled immediately.");
    pushToast({ tone: "warning", title: "Root revoked", message: "All child agents disabled. Budget set to $0.00." });
  }

  async function handleProofClick(key: string, label: string, value?: string) {
    if (!execution || !value || value === "Pending") return;

    if (key === "pii") {
      const removed = execution.metadata.removed;
      pushToast({
        tone: "info",
        title: "PII sanitized",
        message: removed.length ? `Removed before payment: ${removed.join(", ")}` : "No sensitive fields detected.",
      });
      return;
    }

    try {
      await copyText(value);
      setCopiedProofKey(key);
      window.setTimeout(() => setCopiedProofKey((current) => (current === key ? null : current)), 1800);

      if (key === "tx") {
        pushToast({
          tone: "success",
          title: `${label} copied`,
          message: "Full hash copied to clipboard.",
          action: { label: "View on BaseScan", href: `${explorerBase}/tx/${value}` },
        });
        return;
      }

      pushToast({ tone: "success", title: `${label} copied`, message: "Full value copied to clipboard." });
    } catch {
      pushToast({ tone: "error", title: "Copy failed", message: "Could not access the clipboard." });
    }
  }

  const step = phaseIndex[phase];

  return (
    <main className="shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <Image src={logo} alt="r402" width={36} height={36} className="brand-logo" priority />
          </span>
          <span className="brand-copy">
            <strong>r402</strong>
            <span>Sentinel</span>
          </span>
        </div>
        <div className="top-actions">
          <span className="network"><i /> Base</span>
          <button className="wallet-button" onClick={connectWallet}>
            <span className="wallet-gem" />
            {wallet ? short(wallet, 6, 4) : "Connect MetaMask"}
          </button>
        </div>
      </header>

      <section className="hero">
        <div>
          <h1>Let agents act.<br /><em>Never let trust leak.</em></h1>
          <p>One permission, narrow scope, every payment bound to the exact request.</p>
        </div>
        <div className="hero-metrics">
          <Metric value={replayBlocked.toString()} label="Replays blocked" tone="orange" />
          <Metric value={`$${availableBudget.toFixed(2)}`} label="Budget left" />
          <Metric value={phase === "revoked" ? "Off" : "Live"} label="Permission" />
        </div>
      </section>

      <section className="flow-strip">
        {[
          ["Plan", "Intent"],
          ["Grant", "Policy"],
          ["Permit", "Permission"],
          ["Pay", "Payment"],
          ["Relay", "Relay"],
          ["Proof", "Proof"],
        ].map(([title], index) => (
          <div className={`flow-step ${step >= index ? "active" : ""}`} key={title}>
            <span className="flow-number">{step > index ? "✓" : index + 1}</span>
            <strong>{title}</strong>
          </div>
        ))}
      </section>

      <div className={`notice notice-${noticeTone}`}>
        <DotIcon kind={phase === "revoked" ? "lock" : noticeTone === "success" ? "check" : "spark"} />
        <span>{notice}</span>
        <small>{busy ? "Working…" : phase}</small>
      </div>

      <section className="grid grid-top">
        <article className="panel intent-panel">
          <PanelHeader
            title="Mission"
            subtitle="Describe what the agent should do."
            badge={planData?.source?.replace("-live", "") ?? "planner"}
          />
          <label className="intent-input">
            <textarea value={intent} onChange={(event) => setIntent(event.target.value)} />
            <span>{intent.length} chars</span>
          </label>
          <button className="primary-button" disabled={busy || intent.length < 8} onClick={createPlan}>
            {busy && phase === "intent" ? "Building plan..." : "Build proof-bound plan"}
          </button>
        </article>

        <article className="panel permission-panel">
          <PanelHeader
            title="Permission"
            subtitle="Grant a bounded USDC budget on Base."
            badge="7715"
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
            title="Risk check"
            subtitle={planData?.risk.note ?? "Run the planner first."}
            badge={planData?.risk.verdict ?? "waiting"}
          />
          <div className="risk-score">
            <div>
              <strong>{planData?.risk.score ?? "—"}</strong>
              <span>/100 risk</span>
            </div>
          </div>
          <div className="check-list">
            {(planData?.risk.controls ?? [
              "Request binding",
              "Authority narrowing",
              "PII filter",
              "Target allowlist",
            ]).map((control, index) => (
              <div className={planData ? "done" : ""} key={control}>
                <DotIcon kind={planData ? "check" : "lock"} />
                <span>{control}</span>
                <small>{planData ? (index === 2 ? "2 removed" : "Pass") : "—"}</small>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="grid grid-middle">
        <article className="panel delegation-panel">
          <PanelHeader
            title="Agent scopes"
            subtitle="Each child gets less authority than the root."
            badge="7710"
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
            title="Execute"
            subtitle="Pay, relay, and anchor proof."
            badge={execution ? "done" : phase === "executing" ? "running" : "ready"}
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
            {phase === "executing" ? "Executing..." : "Execute protected flow"}
          </button>
        </article>
      </section>

      <section className="grid grid-bottom">
        <article className="panel proof-panel">
          <PanelHeader
            title="Proof"
            subtitle="Cryptographic artifacts from this run."
            badge={execution ? "anchored" : "pending"}
          />
          <p className="proof-hint">
            {execution ? "Click any artifact to copy · transaction opens BaseScan" : "Artifacts appear after execution"}
          </p>
          <div className="proof-grid">
            {[
              { key: "delegation", label: "Delegation hash", value: execution?.manifest.delegationHash },
              { key: "digest", label: "Request digest", value: execution?.manifest.requestDigest },
              { key: "relay", label: "Relay task ID", value: execution?.manifest.relayTaskId },
              { key: "tx", label: "Transaction hash", value: execution?.manifest.transactionHash },
              { key: "proof", label: "Proof hash", value: execution?.manifest.proofHash },
              {
                key: "pii",
                label: "PII sanitization",
                value: execution ? `${execution.metadata.removed.length} fields removed` : undefined,
              },
            ].map(({ key, label, value }) => {
              const ready = Boolean(execution && value);
              return (
                <button
                  type="button"
                  key={key}
                  className={`proof-item ${ready ? "proof-item-active" : ""} ${copiedProofKey === key ? "proof-item-copied" : ""}`}
                  disabled={!ready}
                  onClick={() => handleProofClick(key, label, value)}
                  title={ready ? `Copy ${label}` : "Pending execution"}
                >
                  <span>{label}</span>
                  <strong>{short(value)}</strong>
                  <i className={execution ? "proof-state done" : "proof-state"} aria-hidden>
                    {copiedProofKey === key ? "✓" : execution ? "⎘" : "·"}
                  </i>
                </button>
              );
            })}
          </div>
        </article>

        <article className="panel controls-panel">
          <PanelHeader
            title="Security tests"
            subtitle="Verify replay blocking and revocation."
            badge="firewall"
          />
          <button
            className="control-button replay"
            disabled={!execution || phase === "revoked" || busy}
            onClick={() => execute(true)}
          >
            <span><DotIcon kind="arrow" /></span>
            <div>
              <strong>Replay exact request</strong>
              <small>Should block before payment</small>
            </div>
            <b>{replayBlocked ? `${replayBlocked} blocked` : "Test"}</b>
          </button>
          <button
            className="control-button revoke"
            disabled={phase !== "confirmed"}
            onClick={revoke}
          >
            <span><DotIcon kind="lock" /></span>
            <div>
              <strong>Revoke root delegation</strong>
              <small>Disables all child agents</small>
            </div>
            <b>{phase === "revoked" ? "Revoked" : "Revoke"}</b>
          </button>
        </article>
      </section>

      <footer>
        <span className="footer-brand">
          <Image src={logo} alt="" width={20} height={20} className="footer-logo" aria-hidden />
          r402 Sentinel
        </span>
        <p>Base · MetaMask Smart Accounts · x402 · Venice · 1Shot</p>
      </footer>

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </main>
  );
}

function PanelHeader({
  title,
  subtitle,
  badge,
}: {
  title: string;
  subtitle: string;
  badge?: string;
}) {
  return (
    <div className="panel-header">
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      {badge ? <b>{badge}</b> : null}
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
