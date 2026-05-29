import { extractData } from "../handlers/extractData";

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} environment variable is required`);
  return value;
};

const OCR_URL = requireEnv("OCR_URL");
const CATEGORIZE_URL = requireEnv("CATEGORIZE_URL");
const RULE_CREATE_URL = process.env.RULE_CREATE_URL || "";
const RULE_LOOKUP_URL = process.env.RULE_LOOKUP_URL || "";

export type PipelineItem = {
  name: string;
  price: number;
  category: string;
  confidence: number;
  source: "RULE" | "AI";
};

export type PipelineResult = {
  text: string;
  items: PipelineItem[];
};

const normalizeItemName = (name?: string) => (name || "").trim().toLowerCase();

const normalizeExtractedItems = (items: unknown) =>
  (Array.isArray(items) ? items : [])
    .map((item: any) => ({
      name: String(item?.name || "").trim(),
      price: Number(item?.price)
    }))
    .filter((item) => item.name && Number.isFinite(item.price) && item.price > 0);

async function findMatchingRule(itemName: string, householdId: string) {
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
        return { category: data.category as string };
      }
    } else {
      console.warn("[pipeline] rule lookup non-ok", { status: res.status });
    }
  } catch (err) {
    console.warn("[pipeline] rule lookup error", err);
  }
  return null;
}

async function callCategoriseLambda(itemName: string, amount: number) {
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

async function callRuleCreationLambda(payload: {
  itemName: string;
  category: string;
  confidence: number;
  householdId: string;
}) {
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

export const runPipeline = async (
  imageBase64: string,
  householdId = ""
): Promise<PipelineResult> => {
  if (!imageBase64) throw new Error("imageBase64 is required");

  const ocrRes = await fetch(OCR_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64 })
  });
  if (!ocrRes.ok) {
    const body = await ocrRes.text();
    throw new Error(`OCR lambda error ${ocrRes.status}: ${body}`);
  }
  const ocrJson = (await ocrRes.json()) as {
    text?: string;
    items?: { name?: string; price?: number }[];
  };
  const text = ocrJson.text || "";

  const structuredItems = normalizeExtractedItems(ocrJson.items);
  const extracted = structuredItems.length ? { items: structuredItems } : extractData(text);
  console.info("[pipeline] extraction source", structuredItems.length ? "AnalyzeExpense" : "text fallback");
  const items: PipelineItem[] = [];

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
};
