import type { ExecutionPlan, RiskAssessment } from "@r402/core";
import { assessPlan, planSchema } from "@r402/core";
import { z } from "zod";
import { adapterEnv } from "./env";

const riskSchema = z.object({
  riskScore: z.number().min(0).max(100),
  verdict: z.enum(["allow", "review", "block"]),
  shortUserNote: z.string(),
  piiFindings: z.array(z.string()),
  policyViolations: z.array(z.string()),
  suggestedCaveats: z.array(z.string()),
});

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
        enable_web_search: input.webSearch ?? false,
        enable_web_citations: input.webSearch ?? false,
      },
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `Venice HTTP ${response.status}`);
  }
  return payload.choices[0].message.content as string;
}

export async function runVenicePlanner(intent: string) {
  const content = await veniceChat({
    system:
      "You are the policy planner for a proof-bound agent firewall. Return strict JSON with intent, chainId=8453, maxBudgetUSDC<=8, x402Resources[], allowedTargets[], requiredFunctions[], justification, proofSummary. Never expand authority.",
    user: intent,
    json: true,
    webSearch: true,
  });
  return planSchema.parse(JSON.parse(content));
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
