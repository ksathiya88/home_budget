import { CategoryRule } from "./firestore";

export type AiResult = { category: string; confidence: number };

const normalize = (text: string) => text.trim().toLowerCase();

const keywordMap = new Map<string, string>([
  ["milk", "Provisions"],
  ["butter", "Provisions"],
  ["banana", "Fruits"],
  ["apple", "Fruits"],
  ["chips", "Snacks"],
  ["nuts", "Snacks"]
]);

const localCategorise = (item: string): AiResult => {
  const normalized = normalize(item);
  for (const [keyword, category] of keywordMap.entries()) {
    if (normalized.includes(keyword)) {
      return { category, confidence: 0.85 };
    }
  }
  return { category: "Miscellaneous", confidence: 0.5 };
};

const LAMBDA_URL =
  process.env.REACT_APP_AI_LAMBDA_URL ||
  "https://nihg6j62qaznkflj7j4tvb2lwa0clrbe.lambda-url.eu-west-1.on.aws/";

export const aiCategorise = async (item: string, categoryRules: CategoryRule[] = []): Promise<AiResult> => {
  const normalized = normalize(item);

  if (LAMBDA_URL) {
    try {
      const res = await fetch(LAMBDA_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Send plain JSON body (no nested body) as required by Lambda
        body: JSON.stringify({ item, categoryRules })
      });
      if (res.ok) {
        const data = (await res.json()) as AiResult;
        if (data?.category && typeof data.confidence === "number") {
          // eslint-disable-next-line no-console
          console.info("[aiCategorise] lambda", { item, normalized, data });
          return data;
        }
      }
      // eslint-disable-next-line no-console
      console.warn("[aiCategorise] lambda non-ok, falling back", { status: res.status });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[aiCategorise] lambda error, falling back", err);
    }
  }

  const fallback = localCategorise(item);
  // eslint-disable-next-line no-console
  console.info("[aiCategorise] local fallback", { item, normalized, fallback });
  return fallback;
};

// Synchronous local helper for UI preview
export const aiCategoriseLocal = (item: string): AiResult => localCategorise(item);
