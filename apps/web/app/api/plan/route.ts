import { assessPlan, buildDelegationTree, planSchema } from "@r402/core";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

const plannerSystem =
  "You are an onchain policy planner. Return strict JSON only with intent, chainId=8453, maxBudgetUSDC<=8, x402Resources, allowedTargets, requiredFunctions, justification, proofSummary. Never expand authority or claim research has already happened. Every URL must be absolute and every allowed target must be a string.";

const allowedResources = [
  "https://api.venice.ai/api/v1/chat/completions",
  "https://research.r402.dev/safest-base-usdc-yield",
];
const allowedTargets = [
  "0x1111111111111111111111111111111111111111",
  "0x2222222222222222222222222222222222222222",
];
const allowedFunctions = ["research(bytes)", "anchorProof(bytes32,bytes32,bytes32)"];

const planJsonSchema = {
  name: "execution_plan",
  strict: true,
  schema: {
    type: "object",
    properties: {
      intent: { type: "string" },
      chainId: { type: "integer", enum: [8453] },
      maxBudgetUSDC: { type: "number", minimum: 0.01, maximum: 20 },
      x402Resources: {
        type: "array",
        items: { type: "string" },
        minItems: 1,
        maxItems: 3,
      },
      allowedTargets: {
        type: "array",
        items: { type: "string" },
        minItems: 1,
        maxItems: 5,
      },
      requiredFunctions: {
        type: "array",
        items: { type: "string" },
        minItems: 1,
        maxItems: 5,
      },
      justification: { type: "string" },
      proofSummary: { type: "string" },
    },
    required: [
      "intent",
      "chainId",
      "maxBudgetUSDC",
      "x402Resources",
      "allowedTargets",
      "requiredFunctions",
      "justification",
      "proofSummary",
    ],
    additionalProperties: false,
  },
};

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

async function requestJsonPlan(input: {
  apiKey: string;
  endpoint: string;
  model: string;
  intent: string;
  extraBody?: Record<string, unknown>;
}) {
  const response = await fetch(input.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: input.model,
        messages: [
          {
            role: "system",
            content: plannerSystem,
          },
          { role: "user", content: input.intent },
        ],
        response_format: { type: "json_object" },
        ...input.extraBody,
      }),
    });
  const payload = await response.json();
  if (!response.ok) {
    const message =
      typeof payload.error === "string"
        ? payload.error
        : payload.error?.message ?? `HTTP ${response.status}`;
    throw new Error(message);
  }
  return planSchema.parse(JSON.parse(payload.choices[0].message.content));
}

async function createPlan(intent: string) {
  const failures: string[] = [];

  if (process.env.VENICE_API_KEY) {
    try {
      const plan = await requestJsonPlan({
        apiKey: process.env.VENICE_API_KEY,
        endpoint: "https://api.venice.ai/api/v1/chat/completions",
        model: process.env.VENICE_MODEL ?? "venice-uncensored-1-2",
        intent,
        extraBody: {
          venice_parameters: { include_venice_system_prompt: false },
        },
      });
      return { plan: constrainPlan(plan, intent), source: "venice-live" };
    } catch (error) {
      failures.push(`Venice: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  if (process.env.GROQ_API_KEY) {
    try {
      const plan = await requestJsonPlan({
        apiKey: process.env.GROQ_API_KEY,
        endpoint: "https://api.groq.com/openai/v1/chat/completions",
        model: process.env.GROQ_MODEL ?? "openai/gpt-oss-20b",
        intent,
        extraBody: {
          response_format: {
            type: "json_schema",
            json_schema: planJsonSchema,
          },
          reasoning_effort: "low",
          reasoning_format: "hidden",
        },
      });
      return {
        plan: constrainPlan(plan, intent),
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
    return NextResponse.json({
      plan,
      risk: assessPlan(plan),
      delegations: buildDelegationTree(plan, randomUUID()),
      source: planner.source,
      warning: planner.warning,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Planner failed." },
      { status: 500 },
    );
  }
}
