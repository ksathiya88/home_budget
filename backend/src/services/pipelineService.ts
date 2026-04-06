import { extractData } from "../handlers/extractData";

const OCR_URL =
  process.env.OCR_URL ||
  "https://by42fu2friqj6js7gx6fgl5zju0aoxbt.lambda-url.eu-west-1.on.aws/";

const CATEGORIZE_URL =
  process.env.CATEGORIZE_URL ||
  "https://nihg6j62qaznkflj7j4tvb2lwa0clrbe.lambda-url.eu-west-1.on.aws/";

export type PipelineItem = {
  name: string;
  price: number;
  category: string;
  confidence: number;
};

export type PipelineResult = {
  text: string;
  items: PipelineItem[];
};

export const runPipeline = async (imageBase64: string): Promise<PipelineResult> => {
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
  const ocrJson = (await ocrRes.json()) as { text?: string };
  const text = ocrJson.text || "";

  // Extract items
  const extracted = extractData(text);

  // Categorize each item via Lambda
  const items: PipelineItem[] = [];
  for (const item of extracted.items) {
    let category = "Miscellaneous";
    let confidence = 0.5;
    try {
      const catRes = await fetch(CATEGORIZE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item: item.name, amount: item.price })
      });
      if (catRes.ok) {
        const data = await catRes.json();
        if (data?.category && typeof data.confidence === "number") {
          category = data.category;
          confidence = data.confidence;
        }
      } else {
        console.warn("[pipelineService] categorize lambda non-ok", { status: catRes.status });
      }
    } catch (err) {
      console.warn("[pipelineService] categorize lambda error", err);
    }

    items.push({ ...item, category, confidence });
  }

  return { text, items };
};
