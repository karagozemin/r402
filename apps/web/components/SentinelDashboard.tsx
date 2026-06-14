"use client";

import type {
  DelegationNode,
  ExecutionPlan,
  ProofManifest,
  RiskAssessment,
} from "@r402/core";
import logo from "../../../r402.png";
import { ToastStack, useToasts } from "./ToastStack";
import { inspectMetaMaskAccount, requestRootPermission, revokeRootPermission } from "../lib/metamask";
import Image from "next/image";
import { useMemo, useState } from "react";
import type { Address } from "viem";

type PlanResponse = {
  plan: ExecutionPlan;
  risk: RiskAssessment;
  delegations: DelegationNode[];
  source: string;
  warning?: string;
  research?: string;
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
    taskId?: string;
  };
  anchor?: {
    mode?: "live" | "simulated";
    transactionHash?: string | null;
    consumeTransactionHash?: string | null;
    registry?: string;
  };
  mode?: "live" | "simulated";
  events: { label: string; detail: string }[];
};

type Phase = "intent" | "planned" | "granted" | "executing" | "confirmed" | "revoked";

const defaultIntent =
  "Research the safest Base USDC yield opportunity, buy private intelligence, and anchor an execution proof.";

const phaseIndex: Record<Phase, number> = {
  intent: 0,
  planned: 1,
  granted: 2,
  executing: 4,
  confirmed: 5,
  revoked: 5,
};

type NoticeTone = "info" | "success" | "error" | "warning";

const explorerBase =
  process.env.NEXT_PUBLIC_BASE_EXPLORER ?? "https://basescan.org";

const proofRegistryAddress = process.env.NEXT_PUBLIC_PROOF_REGISTRY_ADDRESS;

function envFlag(value?: string) {
  return value === "true" || value === "1";
}

const liveGrantEnabled = Boolean(process.env.NEXT_PUBLIC_SESSION_ACCOUNT);
const liveExecutionEnabled = envFlag(process.env.NEXT_PUBLIC_ONE_SHOT_LIVE);
const isLiveMode = liveGrantEnabled && liveExecutionEnabled;

const liveUsdcPrereqMessage =
  "Keep ~$0.02+ USDC on Base in your connected MetaMask Smart Account before Execute (~$0.01 relayer fee + ~$0.01 work transfer). Both legs are USDC transfers required by periodic ERC-7715 permissions — not ETH.";

function proofScanUrl(key: string, value: string, execution?: ExecutionResponse | null) {
  if (key === "pii") return null;

  const onChain = new Set<string>();
  const txs = execution?.manifest.onChainTransactions;
  if (txs?.anchor) onChain.add(txs.anchor.toLowerCase());
  if (txs?.consume) onChain.add(txs.consume.toLowerCase());
  if (txs?.relay) onChain.add(txs.relay.toLowerCase());
  if (execution?.manifest.transactionHash) {
    onChain.add(execution.manifest.transactionHash.toLowerCase());
  }

  if (
    (key === "tx" || key === "anchor-tx" || key === "consume-tx" || key === "relay-tx") &&
    value.startsWith("0x") &&
    value.length === 66 &&
    onChain.has(value.toLowerCase())
  ) {
    return `${explorerBase}/tx/${value}`;
  }

  if ((key === "digest" || key === "proof") && proofRegistryAddress) {
    return `${explorerBase}/address/${proofRegistryAddress}#readContract`;
  }

  if (key === "delegation" || key === "digest" || key === "proof" || key === "relay") {
    return null;
  }

  return null;
}

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
  const [notice, setNotice] = useState(
    isLiveMode
      ? `Live mode active. ${liveUsdcPrereqMessage}`
      : "Demo mode is active. Live adapters are ready for credentials.",
  );
  const [copiedProofKey, setCopiedProofKey] = useState<string | null>(null);
  const [permissionContext, setPermissionContext] = useState<string | null>(null);
  const [rootDelegation, setRootDelegation] = useState<unknown>(null);
  const [signedBundle, setSignedBundle] = useState<Record<string, unknown> | null>(null);
  const [budgetUSDC, setBudgetUSDC] = useState(20);
  const { toasts, push: pushToast, dismiss: dismissToast } = useToasts();

  const noticeTone = noticeToneFor(notice, phase);

  const availableBudget = useMemo(() => {
    if (phase === "revoked") return 0;
    return Math.max(0, budgetUSDC - (execution?.manifest.paidUSDC ?? 0));
  }, [execution, phase, budgetUSDC]);

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

      const sessionAccount = process.env.NEXT_PUBLIC_SESSION_ACCOUNT;
      if (sessionAccount) {
        try {
          const diagnostics = await inspectMetaMaskAccount(accounts[0] as Address);
          setNotice(diagnostics.hint);
          pushToast({
            tone: diagnostics.smartAccountOnBase && diagnostics.supportsPeriodicOnBase ? "success" : "info",
            title: diagnostics.smartAccountOnBase ? "Smart Account on Base" : "Base setup needed",
            message: diagnostics.smartAccountOnBase
              ? `${short(accounts[0], 8, 6)} · ${diagnostics.delegatorLabel ?? "7702"}`
              : diagnostics.hint,
          });
        } catch (diagnosticError) {
          const message =
            diagnosticError instanceof Error ? diagnosticError.message : "Could not inspect MetaMask on Base.";
          setNotice(message);
          pushToast({ tone: "warning", title: "Base check", message });
        }
        return;
      }

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
      setSignedBundle(null);
      setPermissionContext(null);
      setRootDelegation(null);
      setBudgetUSDC(20);
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
    if (!planData) return;
    const sessionAccount = process.env.NEXT_PUBLIC_SESSION_ACCOUNT as Address | undefined;
    setBusy(true);
    try {
      let context: string;

      if (sessionAccount) {
        const granted = await requestRootPermission(sessionAccount);
        context = granted.context;
        setRootDelegation(granted.granted);
        setPermissionContext(context);
        setPhase("granted");
        setNotice(`Live ERC-7715 permission granted: ${short(context)}`);
        pushToast({
          tone: "success",
          title: "Permission granted",
          message: `Delegated to 1Shot relayer on Base · ${short(granted.from)}`,
        });
        if (isLiveMode) {
          pushToast({
            tone: "info",
            title: "Before Execute",
            message: liveUsdcPrereqMessage,
          });
        }
      } else {
        if (!wallet) setWallet("0x71C2...98A4");
        context = `0xdemo${Date.now().toString(16).padStart(58, "0")}`;
        setNotice("Demo ERC-7715 permission granted. Add NEXT_PUBLIC_SESSION_ACCOUNT for live mode.");
        pushToast({ tone: "success", title: "Permission granted", message: "Demo root scope unlocked — you can execute the flow." });
        setPermissionContext(context);
        setPhase("granted");
      }

      try {
        const redelegation = await fetch("/api/delegations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan: planData.plan, permissionContext: context }),
        });
        const redelegationPayload = await redelegation.json();
        if (!redelegation.ok) throw new Error(redelegationPayload.error);

        if (redelegationPayload.bundles?.length) {
          setSignedBundle({
            bundles: redelegationPayload.bundles,
            sessionAccount: redelegationPayload.sessionAccount,
            permissionContext: context,
          });
        } else if (redelegationPayload.mode === "live") {
          setSignedBundle({ permissionContext: context, bundles: [] });
        }

        if (redelegationPayload.delegations) {
          setPlanData({ ...planData, delegations: redelegationPayload.delegations });
        }

        if (redelegationPayload.mode === "live" && redelegationPayload.message) {
          pushToast({
            tone: "info",
            title: "Policy tree ready",
            message: redelegationPayload.message,
          });
        } else if (redelegationPayload.bundles?.length) {
          pushToast({
            tone: "success",
            title: "Redelegation signed",
            message: "Payment, execution, and proof child agents are live.",
          });
        }
      } catch (redelegationError) {
        const message =
          redelegationError instanceof Error ? redelegationError.message : "Redelegation failed.";
        setNotice(message);
        pushToast({
          tone: "error",
          title: "Redelegation failed",
          message,
        });
      }

      try {
        const budgetResponse = await fetch("/api/budget", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ permissionContext: context }),
        });
        const budgetPayload = await budgetResponse.json();
        if (budgetResponse.ok && typeof budgetPayload.availableUSDC === "number") {
          setBudgetUSDC(budgetPayload.availableUSDC);
        }
      } catch {
        // Budget read is best-effort; grant still succeeded.
      }
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
        body: JSON.stringify({
          plan: planData.plan,
          delegations: planData.delegations,
          permissionContext: permissionContext ?? undefined,
          signedBundle: signedBundle ?? undefined,
        }),
      });
      const payload = await response.json();
      if (response.status === 409) {
        setReplayBlocked((count) => count + 1);
        const replayMessage = replay
          ? "Replay blocked before payment: requestDigest was already consumed."
          : "This request was already executed in this session. Build a new plan for a fresh run, or use Replay to test duplicate blocking.";
        setNotice(replayMessage);
        pushToast({
          tone: "warning",
          title: replay ? "Replay blocked" : "Already executed",
          message: replay
            ? "The request digest was already consumed — no duplicate payment."
            : "Same plan + delegation digest was consumed. Re-plan to execute again.",
        });
        return;
      }
      if (!response.ok) throw new Error(payload.error);
      await new Promise((resolve) => setTimeout(resolve, 650));
      setExecution(payload);
      setPhase("confirmed");
      const modeLabel = payload.mode === "live" ? "live" : "simulated";
      setNotice(`Execution confirmed (${modeLabel}) and proof manifest anchored.`);
      pushToast({
        tone: "success",
        title: "Execution confirmed",
        message: `$${payload.manifest.paidUSDC} paid · ${modeLabel} · click artifacts below to copy`,
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

  async function revoke() {
    setBusy(true);
    try {
      const sessionAccount = process.env.NEXT_PUBLIC_SESSION_ACCOUNT;

      if (sessionAccount && permissionContext) {
        await revokeRootPermission(permissionContext as `0x${string}`);
        setPhase("revoked");
        setBudgetUSDC(0);
        setNotice("Root delegation revoked on-chain via MetaMask.");
        pushToast({
          tone: "warning",
          title: "Root revoked",
          message: "MetaMask invalidated the permission context. All child agents are disabled.",
        });
        return;
      }

      const response = await fetch("/api/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          permissionContext: permissionContext ?? undefined,
          demo: !permissionContext,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);

      setPhase("revoked");
      setBudgetUSDC(0);
      setNotice("Root delegation revoked. All child agents are disabled immediately.");
      pushToast({
        tone: "warning",
        title: "Root revoked",
        message: "All child agents disabled. Budget set to $0.00.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Revoke failed.";
      setNotice(message);
      pushToast({ tone: "error", title: "Revoke failed", message });
    } finally {
      setBusy(false);
    }
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

      const scanUrl = proofScanUrl(key, value, execution);
      if (scanUrl) {
        window.open(scanUrl, "_blank", "noopener,noreferrer");
      }

      pushToast({
        tone: "success",
        title: `${label} copied`,
        message: scanUrl
          ? "Opened confirmed Base transaction on BaseScan."
          : "Off-chain binding hash copied (not a Base transaction).",
        action: scanUrl ? { label: "Open BaseScan", href: scanUrl } : undefined,
      });
    } catch {
      const scanUrl = proofScanUrl(key, value, execution);
      if (scanUrl) {
        window.open(scanUrl, "_blank", "noopener,noreferrer");
        pushToast({
          tone: "info",
          title: `${label} opened`,
          message: "BaseScan opened — clipboard access was blocked.",
          action: { label: "Open BaseScan", href: scanUrl },
        });
        return;
      }
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
          <Metric value={phase === "revoked" ? "Off" : isLiveMode ? "Live" : permissionContext ? "Live" : "Demo"} label="Permission" />
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

      {isLiveMode ? (
        <div className="live-prereq-banner" role="status">
          <DotIcon kind="spark" />
          <div className="live-prereq-copy">
            <strong>Live mode checklist · USDC on Base</strong>
            <p>{liveUsdcPrereqMessage}</p>
          </div>
          <a
            className="live-prereq-link"
            href="https://bridge.base.org"
            target="_blank"
            rel="noopener noreferrer"
          >
            Bridge to Base
          </a>
        </div>
      ) : null}

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
            subtitle={planData?.research ?? planData?.risk.note ?? "Run the planner first."}
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
          {isLiveMode && phase === "granted" ? (
            <p className="execute-prereq">Tip: keep ~$0.02 USDC on Base (~$0.01 relayer fee + ~$0.01 work transfer).</p>
          ) : null}
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
            {execution
              ? "On-chain txs open BaseScan. Delegation/digest/proof hashes are off-chain bindings until anchored."
              : "Artifacts appear after execution"}
          </p>
          <div className="proof-grid">
            {[
              { key: "delegation", label: "Delegation hash", value: execution?.manifest.delegationHash },
              { key: "digest", label: "Request digest", value: execution?.manifest.requestDigest },
              { key: "relay", label: "Relay task ID", value: execution?.manifest.relayTaskId },
              {
                key: "tx",
                label: "Anchor tx (Base)",
                value: execution?.manifest.onChainTransactions?.anchor ?? execution?.manifest.transactionHash,
              },
              {
                key: "consume-tx",
                label: "Consume tx (Base)",
                value: execution?.manifest.onChainTransactions?.consume,
              },
              {
                key: "relay-tx",
                label: "Relay tx (Base)",
                value: execution?.manifest.onChainTransactions?.relay,
              },
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
                  title={
                    ready
                      ? proofScanUrl(key, value ?? "", execution)
                        ? `Copy ${label} and open BaseScan`
                        : `Copy ${label} (off-chain binding)`
                      : "Pending execution"
                  }
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
