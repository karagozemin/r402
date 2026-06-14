import type { ExecutionPlan, RiskAssessment } from "@r402/core";
import { assessPlan, planSchema } from "@r402/core";
import { z } from "zod";
import { adapterEnv } from "./env";

const ALLOWED_RESOURCES = [
  "https://api.venice.ai/api/v1/chat/completions",
  "https://research.r402.dev/safest-base-usdc-yield",
] as const;

const ALLOWED_TARGETS = [
  "0x1111111111111111111111111111111111111111",
  "0x2222222222222222222222222222222222222222",
] as const;

const ALLOWED_FUNCTIONS = ["research(bytes)", "anchorProof(bytes32,bytes32,bytes32)"] as const;

const riskSchema = z.object({
  riskScore: z.number().min(0).max(100),
  verdict: z.enum(["allow", "review", "block"]),
  shortUserNote: z.string(),
  piiFindings: z.array(z.string()),
  policyViolations: z.array(z.string()),
  suggestedCaveats: z.array(z.string()),
});

function veniceWebSearchMode(enabled: boolean) {
  return enabled ? "auto" : "off";
}

export function normalizePlannerOutput(raw: unknown, intent: string): ExecutionPlan {
  const obj = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;

  const resources = Array.isArray(obj.x402Resources)
    ? obj.x402Resources.filter(
        (resource): resource is string =>
          typeof resource === "string" && ALLOWED_RESOURCES.includes(resource as (typeof ALLOWED_RESOURCES)[number]),
      )
    : [];

  const targets = Array.isArray(obj.allowedTargets)
    ? obj.allowedTargets.filter(
        (target): target is string => typeof target === "string" && /^0x[a-fA-F0-9]{40}$/.test(target),
      )
    : [];

  const functions = Array.isArray(obj.requiredFunctions)
    ? obj.requiredFunctions.filter(
        (fn): fn is string =>
          typeof fn === "string" &&
          ALLOWED_FUNCTIONS.includes(fn as (typeof ALLOWED_FUNCTIONS)[number]),
      )
    : [];

  const budget = Number(obj.maxBudgetUSDC);
  const normalizedBudget = Number.isFinite(budget) ? Math.min(Math.max(budget, 0.1), 8) : 8;

  const parsedIntent = String(obj.intent ?? "").trim();
  const normalizedIntent = parsedIntent.length >= 8 ? parsedIntent : intent.trim();
  return planSchema.parse({
    intent: normalizedIntent,
    chainId: 8453,
    maxBudgetUSDC: normalizedBudget,
    x402Resources: resources.length ? resources : [ALLOWED_RESOURCES[0]],
    allowedTargets: targets.length ? targets.slice(0, 5) : [...ALLOWED_TARGETS],
    requiredFunctions: functions.length ? functions : [...ALLOWED_FUNCTIONS],
    justification:
      String(obj.justification ?? "Minimum-authority plan scoped to the user intent on Base.").trim() ||
      "Minimum-authority plan scoped to the user intent on Base.",
    proofSummary:
      String(obj.proofSummary ?? "Bind permission, quote, paid request, relay task, and transaction proof.").trim() ||
      "Bind permission, quote, paid request, relay task, and transaction proof.",
  });
}

async function veniceChat(input: {
  system: string;
  user: string;
  json?: boolean;
  webSearch?: boolean;
}) {
  if (!adapterEnv.veniceApiKey) throw new Error("VENICE_API_KEY is required");

  const response = await fetch("https://api.venice.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adapterEnv.veniceApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: adapterEnv.veniceModel,
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
      ],
      response_format: input.json ? { type: "json_object" } : undefined,
      venice_parameters: {
        include_venice_system_prompt: false,
        enable_web_search: veniceWebSearchMode(input.webSearch ?? false),
        enable_web_citations: Boolean(input.webSearch),
      },
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    const detail =
      payload.error?.message ??
      payload.issues?.[0]?.message ??
      payload.details?.venice_parameters?.enable_web_search?._errors?.[0] ??
      "request rejected";
    throw new Error(`Venice HTTP ${response.status}: ${detail}`);
  }
  return payload.choices[0].message.content as string;
}

const plannerSystemPrompt = `You are the policy planner for a proof-bound agent firewall on Base (chainId 8453).
Return strict JSON with these fields only:
{
  "intent": "string",
  "chainId": 8453,
  "maxBudgetUSDC": number between 0.1 and 8,
  "x402Resources": ["https://api.venice.ai/api/v1/chat/completions"],
  "allowedTargets": ["0x1111111111111111111111111111111111111111"],
  "requiredFunctions": ["research(bytes)"],
  "justification": "string",
  "proofSummary": "string"
}
Never expand authority beyond the user intent. Use only the example URLs and hex targets shown above.`;

export async function runVenicePlanner(intent: string) {
  const content = await veniceChat({
    system: plannerSystemPrompt,
    user: intent,
    json: true,
    webSearch: true,
  });
  return normalizePlannerOutput(JSON.parse(content), intent);
}

export async function runVeniceRiskAgent(plan: ExecutionPlan): Promise<RiskAssessment> {
  const baseline = assessPlan(plan);

  if (!adapterEnv.veniceApiKey) {
    return { ...baseline, note: baseline.note, findings: baseline.findings };
  }

  try {
    const content = await veniceChat({
      system:
        "You are the risk engine for an onchain agent firewall. Return strict JSON with riskScore, verdict, shortUserNote, piiFindings[], policyViolations[], suggestedCaveats[]. Prefer narrower caveats and shorter expiry.",
      user: JSON.stringify({ plan, allowlist: plan.x402Resources }),
      json: true,
    });
    const parsed = riskSchema.parse(JSON.parse(content));
    return {
      score: parsed.riskScore,
      verdict: parsed.verdict,
      note: parsed.shortUserNote,
      findings: parsed.policyViolations.length ? parsed.policyViolations : baseline.findings,
      controls: baseline.controls,
      piiFindings: parsed.piiFindings.length ? parsed.piiFindings : baseline.piiFindings,
    };
  } catch {
    return baseline;
  }
}

export async function runVeniceResearchSnippet(intent: string) {
  if (!adapterEnv.veniceApiKey) return null;
  try {
    return await veniceChat({
      system: "Return one sentence of cited market context for the user intent.",
      user: intent,
      webSearch: true,
    });
  } catch {
    return null;
  }
}
