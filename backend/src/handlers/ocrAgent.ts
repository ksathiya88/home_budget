import { , AnalyzeExpenseCommand } from "@aws-sdk/client-textract";

const client = new TextractClient({ region: process.env.AWS_REGION || "eu-west-1" });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "OPTIONS,POST"
};

type Event = {
  body?: string | null;
  isBase64Encoded?: boolean;
  httpMethod?: string;
  requestContext?: { http?: { method?: string } };
};

const parseAmount = (text: unknown): number | null => {
  const cleaned = String(text || "")
    .replace(/[,£$€]/g, "")
    .replace(/[^\d.-]/g, " ")
    .trim();
  const matches = [...cleaned.matchAll(/-?\d+(?:\.\d{1,2})?/g)].map((m) => Number(m[0]));
  return matches.reverse().find((n) => Number.isFinite(n) && n >= 0) ?? null;
};

const getFieldText = (field: any) => field?.ValueDetection?.Text || field?.LabelDetection?.Text || "";
const getFieldType = (field: any) => (field?.Type?.Text || "").toUpperCase();
const getFieldConfidence = (field: any) => field?.ValueDetection?.Confidence || field?.Type?.Confidence || 0;

const cleanItemName = (name: string, amount: number | null) => {
  const amountText = amount == null ? "" : String(amount).replace(".", "\\.");
  const withoutAmount = amountText ? name.replace(new RegExp(`£?${amountText}\\s*$`), "") : name;
  return withoutAmount
    .replace(/[£$€]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
};

const isLikelyExpenseItem = (name: string, price: number | null): price is number => {
  if (!name || !Number.isFinite(price) || price <= 0 || price > 10000) return false;
  const normalized = name.trim().toLowerCase();
  if (normalized.length < 3) return false;

  const blocked = [
    "total",
    "subtotal",
    "vat",
    "tax",
    "cash",
    "change",
    "mastercard",
    "visa",
    "card",
    "auth code",
    "merchant",
    "receipt",
    "clubcard",
    "balance",
    "points",
    "barcode",
    "www.",
    "store locator"
  ];
  if (blocked.some((word) => normalized.includes(word))) return false;

  const letters = normalized.replace(/[^a-z]/g, "").length;
  const digits = normalized.replace(/\D/g, "").length;
  return letters >= 2 && digits <= letters + 4;
};

const parseExpenseResponse = (res: any) => {
  const lines =
    res.Blocks?.filter((b: any) => b.BlockType === "LINE" && b.Text)
      .map((b: any) => b.Text as string)
      .filter(Boolean) || [];

  const summary: Record<string, string> = {};
  const items: { name: string; price: number; ocrConfidence: number }[] = [];

  for (const doc of res.ExpenseDocuments || []) {
    for (const field of doc.SummaryFields || []) {
      const type = getFieldType(field);
      const text = getFieldText(field);
      if (type && text) summary[type] = text;
    }

    for (const group of doc.LineItemGroups || []) {
      for (const lineItem of group.LineItems || []) {
        const fields = lineItem.LineItemExpenseFields || [];
        const priceField =
          fields.find((field: any) => ["PRICE", "ITEM_PRICE", "TOTAL_PRICE", "AMOUNT"].includes(getFieldType(field))) ||
          fields.find((field: any) => getFieldType(field).includes("PRICE") || getFieldType(field).includes("AMOUNT"));
        const rowField = fields.find((field: any) => getFieldType(field) === "EXPENSE_ROW");
        const nameField =
          fields.find((field: any) => ["ITEM", "DESCRIPTION", "PRODUCT_CODE"].includes(getFieldType(field))) ||
          rowField ||
          fields.find((field: any) => !parseAmount(getFieldText(field)));

        const price = parseAmount(getFieldText(priceField) || getFieldText(rowField));
        const name = cleanItemName(getFieldText(nameField || rowField), price);

        if (isLikelyExpenseItem(name, price)) {
          items.push({
            name,
            price,
            ocrConfidence: Math.round(Math.min(getFieldConfidence(nameField), getFieldConfidence(priceField)) || 0)
          });
        }
      }
    }
  }

  return { text: lines.join("\n"), items, summary };
};

export const handler = async (event: Event) => {
  const method =
    (event.requestContext?.http?.method || event.httpMethod || "").toUpperCase();
  if (method === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

  try {
    const rawBody =
      typeof event.body === "string"
        ? event.isBase64Encoded
          ? Buffer.from(event.body, "base64").toString("utf-8")
          : event.body
        : "{}";
    const parsed = JSON.parse(rawBody || "{}");
    const imageBase64 = parsed.imageBase64 as string | undefined;

    if (!imageBase64) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "imageBase64 is required" })
      };
    }

    const imageBytes = Buffer.from(imageBase64, "base64");
    console.info("[ocr] input size bytes:", imageBytes.byteLength);

    const res = await client.send(
      new AnalyzeExpenseCommand({
        Document: { Bytes: imageBytes }
      })
    );

    const { text, items, summary } = parseExpenseResponse(res);
    console.info("[ocr] final text length:", text.length);
    console.info("[ocr] structured items count:", items.length);

    return {
      statusCode: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ text, items, summary })
    };
  } catch (err) {
    console.error("[ocr] error", err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: "ocr_failed" })
    };
  }
};
