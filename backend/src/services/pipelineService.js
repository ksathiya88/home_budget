const { extractData } = require("../handlers/extractData");

const OCR_URL =
  process.env.OCR_URL ||
  "https://by42fu2friqj6js7gx6fgl5zju0aoxbt.lambda-url.eu-west-1.on.aws/";

const CATEGORIZE_URL =
  process.env.CATEGORIZE_URL ||
  "https://nihg6j62qaznkflj7j4tvb2lwa0clrbe.lambda-url.eu-west-1.on.aws/";

const RULE_CREATE_URL =
  process.env.RULE_CREATE_URL ||
  "https://s4eufxr5d26mgjwcdx3oiktaxm0xzrfb.lambda-url.eu-west-1.on.aws/";

const RULE_LOOKUP_URL =
  process.env.RULE_LOOKUP_URL ||
  "https://b56yhwyjcraj3tum43vucchy5a0nonut.lambda-url.eu-west-1.on.aws/";

const normalizeItemName = (name) => (name || "").trim().toLowerCase();

async function findMatchingRule(itemName, householdId) {
  if (!RULE_LOOKUP_URL) return null;
  const keyword = normalizeItemName(itemName);
  try {
    const res = await fetch(
      `${RULE_LOOKUP_URL}?householdId=${encodeURIComponent(householdId || "")}&keyword=${encodeURIComponent(keyword)}`
    );
    if (res.ok) {
      const data = await res.json();
      if (data?.category) {
        console.info("[pipeline] rule match", { keyword, category: data.category });
        return { category: data.category };
      }
    } else {
      console.warn("[pipeline] rule lookup non-ok", { status: res.status });
    }
  } catch (err) {
    console.warn("[pipeline] rule lookup error", err);
  }
  return null;
}

async function callCategoriseLambda(itemName, amount) {
  let category = "Miscellaneous";
  let confidence = 0.5;
  try {
    const res = await fetch(CATEGORIZE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item: itemName, amount })
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.category && typeof data.confidence === "number") {
        category = data.category;
        confidence = data.confidence;
      }
      console.info("[pipeline] ai result", { itemName, category, confidence });
    } else {
      console.warn("[pipeline] categorize lambda non-ok", { status: res.status });
    }
  } catch (err) {
    console.warn("[pipeline] categorize lambda error", err);
  }
  return { category, confidence };
}

async function callRuleCreationLambda(payload) {
  if (!RULE_CREATE_URL) {
    console.info("[pipeline] rule creation skipped (no RULE_CREATE_URL)");
    return;
  }
  try {
    const res = await fetch(RULE_CREATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      console.warn("[pipeline] rule creation lambda non-ok", { status: res.status });
    } else {
      console.info("[pipeline] rule creation lambda called", payload);
    }
  } catch (err) {
    console.warn("[pipeline] rule creation lambda error", err);
  }
}

/**
 * @param {string} imageBase64
 * @param {string} [householdId]
 * @returns {Promise<{ text: string; items: { name: string; price: number; category: string; confidence: number; source: string }[] }>}
 */
async function runPipeline(imageBase64, householdId = "") {
  if (!imageBase64) throw new Error("imageBase64 is required");

  // OCR via Lambda
  const ocrRes = await fetch(OCR_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64 })
  });
  if (!ocrRes.ok) {
    const body = await ocrRes.text();
    throw new Error(`OCR lambda error ${ocrRes.status}: ${body}`);
  }
  const ocrJson = (await ocrRes.json()) || {};
  const text = ocrJson.text || "";

  // Extract items
  const extracted = extractData(text);

  // Rule-first then categorize items via Lambda
  const items = [];
  for (const item of extracted.items) {
    const normalized = normalizeItemName(item.name);
    const ruleHit = await findMatchingRule(normalized, householdId);
    if (ruleHit) {
      items.push({ ...item, category: ruleHit.category, confidence: 1, source: "RULE" });
      console.info("[pipeline] AI skipped due to rule", { normalized, category: ruleHit.category });
      continue;
    }

    const ai = await callCategoriseLambda(item.name, item.price);
    items.push({ ...item, category: ai.category, confidence: ai.confidence, source: "AI" });

    if (ai.confidence >= 0.75) {
      await callRuleCreationLambda({
        itemName: item.name,
        category: ai.category,
        confidence: ai.confidence,
        householdId
      });
    } else {
      console.info("[pipeline] rule creation skipped (low confidence)", {
        item: item.name,
        confidence: ai.confidence
      });
    }
  }

  return { text, items };
}

module.exports = { runPipeline };
