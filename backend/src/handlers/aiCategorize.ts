import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

const client = new BedrockRuntimeClient({});

const CATEGORIES = [
  "Vegetables",
  "Fruits",
  "Provisions",
  "Snacks",
  "Household Items",
  "Investment",
  "Bills",
  "Toys"
] as const;

type Category = (typeof CATEGORIES)[number] | string;

type CategoryRule = { keyword: string; category: string };

type Event = {
  item?: string;
  amount?: number;
  categoryRules?: CategoryRule[];
  httpMethod?: string;
  requestContext?: { http?: { method?: string } };
};

export const handler = async (event: any) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "OPTIONS,POST"
  };

  // CORS preflight
  const method =
    (event.httpMethod || "").toUpperCase() ||
    (event.requestContext?.http?.method || "").toUpperCase();

  if (method === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

  // Support API Gateway/Function URL payloads and nested { body: "..." }
  const topLevelBody = typeof event.body === "string" ? event.body : null;
  let parsedBody: any = {};
  if (topLevelBody) {
    try {
      parsedBody = JSON.parse(topLevelBody);
      // If body contains another serialized body, unwrap it
      if (parsedBody && typeof parsedBody.body === "string") {
        parsedBody = JSON.parse(parsedBody.body);
      }
    } catch (err) {
      console.warn("[aiCategorize] body parse failed", err);
    }
  }

  const item = (event.item || parsedBody.item || "").trim();
  const amount = event.amount ?? parsedBody.amount ?? 0;
  const rawRules: CategoryRule[] = event.categoryRules || parsedBody.categoryRules || [];
  const rules = rawRules
    .map((r) => ({
      ...r,
      keyword: (r.keyword || "").trim().toLowerCase(),
      category: (r.category || "").trim()
    }))
    .filter(
      (r) => r.keyword.length && r.category.length && r.category.toLowerCase() !== "uncategorized"
    );

  if (!item) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "item is required" }) };
  }

  // 1) rule check
  const normalizedItem = item.toLowerCase();
  const ruleHit = rules.find((r) => normalizedItem.includes(r.keyword));
  if (ruleHit) {
    const body = {
      category: ruleHit.category,
      confidence: 1,
      needsReview: false,
      reason: `Matched rule keyword "${ruleHit.keyword}"`
    };
    console.info("[aiCategorize] rule hit", { item, rule: ruleHit });
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(body) };
  }

  // 2) Build Bedrock agent-like prompt
  const prompt = [
    "You are a financial expense categorisation agent.",
    "Decide the best category. If unsure, lower confidence.",
    "Categories:", CATEGORIES.join(", "),
    "Item name:", item,
    `Amount: ${amount}`,
    "Existing category rules (keyword -> category):",
    rules.length ? JSON.stringify(rules) : "None",
    "Return ONLY JSON: {\"category\":\"<one category>\",\"confidence\":0-1,\"needsReview\":true|false,\"reason\":\"...\"}",
    "If confidence < 0.7, set needsReview true."
  ].join("\n");

  const payload = {
    modelId: "anthropic.claude-3-haiku-20240307-v1:0",
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }]
    })
  };

  try {
    const res = await client.send(new InvokeModelCommand(payload));
    const raw = res.body ? Buffer.from(res.body).toString("utf-8") : "{}";
    const parsed = JSON.parse(raw);
    const text = parsed?.content?.[0]?.text ?? raw;
    const safe = JSON.parse(text);

    const category: Category = CATEGORIES.includes(safe.category) ? safe.category : "Miscellaneous";
    const confidence = Math.min(Math.max(Number(safe.confidence) || 0, 0), 1);
    const needsReview = confidence < 0.7;

    const body = {
      category,
      confidence,
      needsReview,
      reason: safe.reason || (needsReview ? "Low confidence" : "Model confident")
    };

    console.info("[aiCategorize] model", { item, category, confidence, needsReview });
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(body) };
  } catch (err) {
    console.error("Bedrock invoke failed", err);
    const fallback = {
      category: "Miscellaneous",
      confidence: 0.3,
      needsReview: true,
      reason: "Model error"
    };
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify(fallback) };
  }
};
