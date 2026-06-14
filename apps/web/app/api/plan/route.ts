import { assessPlan, buildDelegationTree } from "@r402/core";
import { normalizePlannerOutput, runVenicePlanner, runVeniceRiskAgent, runVeniceResearchSnippet } from "@r402/adapters";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

const allowedResources = [
  "https://api.venice.ai/api/v1/chat/completions",
  "https://research.r402.dev/safest-base-usdc-yield",
];
const allowedTargets = [
  "0x1111111111111111111111111111111111111111",
  "0x2222222222222222222222222222222222222222",
];
const allowedFunctions = ["research(bytes)", "anchorProof(bytes32,bytes32,bytes32)"];

function demoPlan(intent: string) {
  return {
    intent,
    chainId: 8453 as const,
    maxBudgetUSDC: 8,
    x402Resources: [allowedResources[0]],
    allowedTargets,
    requiredFunctions: allowedFunctions,
    justification: "Purchase private market intelligence and anchor its execution proof.",
    proofSummary: "Bind permission, quote, paid request, relay task, and transaction.",
  };
}

function constrainPlan(plan: ReturnType<typeof demoPlan>, intent: string) {
  const resources = plan.x402Resources.filter((resource) => allowedResources.includes(resource));
  const targets = plan.allowedTargets.filter((target) => allowedTargets.includes(target));
  const functions = plan.requiredFunctions.filter((fn) => allowedFunctions.includes(fn));

  return {
    ...plan,
    intent,
    chainId: 8453 as const,
    maxBudgetUSDC: Math.min(plan.maxBudgetUSDC, 8),
    x402Resources: resources.length ? resources : [allowedResources[0]],
    allowedTargets: targets.length ? targets : allowedTargets,
    requiredFunctions: functions.length ? functions : allowedFunctions,
    proofSummary: "Bind the approved plan, paid request, relay task, and confirmed transaction.",
  };
}

async function createPlan(intent: string) {
  const failures: string[] = [];

  if (process.env.VENICE_API_KEY) {
    try {
      const plan = constrainPlan(await runVenicePlanner(intent), intent);
      const research = await runVeniceResearchSnippet(intent);
      return {
        plan,
        source: "venice-live",
        research,
      };
    } catch (error) {
      failures.push(`Venice: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  if (process.env.GROQ_API_KEY) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.GROQ_MODEL ?? "openai/gpt-oss-20b",
          messages: [
            {
              role: "system",
              content:
                'Return strict JSON: {"intent":"...","chainId":8453,"maxBudgetUSDC":8,"x402Resources":["https://api.venice.ai/api/v1/chat/completions"],"allowedTargets":["0x1111111111111111111111111111111111111111"],"requiredFunctions":["research(bytes)"],"justification":"...","proofSummary":"..."}',
            },
            { role: "user", content: intent },
          ],
          response_format: { type: "json_object" },
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? `HTTP ${response.status}`);
      const plan = constrainPlan(
        normalizePlannerOutput(JSON.parse(payload.choices[0].message.content), intent),
        intent,
      );
      return {
        plan,
        source: "groq-live",
        warning: failures.length ? `${failures.join(" | ")} Groq fallback active.` : undefined,
      };
    } catch (error) {
      failures.push(`Groq: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  return {
    plan: demoPlan(intent),
    source: "deterministic-fallback",
    warning: failures.length ? `${failures.join(" | ")} Deterministic fallback active.` : undefined,
  };
}

export async function POST(request: Request) {
  const body = await request.json();
  const intent = String(body.intent ?? "").trim();
  if (intent.length < 8) {
    return NextResponse.json({ error: "Describe an intent with at least 8 characters." }, { status: 400 });
  }

  try {
    const planner = await createPlan(intent);
    const plan = planner.plan;
    const risk = process.env.VENICE_API_KEY
      ? await runVeniceRiskAgent(plan)
      : assessPlan(plan);

    return NextResponse.json({
      plan,
      risk,
      delegations: buildDelegationTree(plan, randomUUID()),
      source: planner.source,
      warning: planner.warning,
      research: "research" in planner ? planner.research : undefined,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Planner failed." },
      { status: 500 },
    );
  }
}
