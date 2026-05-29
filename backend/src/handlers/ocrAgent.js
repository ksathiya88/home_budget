// CommonJS version for Lambda (Node.js 18 default = CJS unless "type": "module")
const { TextractClient, AnalyzeExpenseCommand } = require("@aws-sdk/client-textract");

const client = new TextractClient({ region: process.env.AWS_REGION || "eu-west-1" });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "OPTIONS,POST"
};

const parseAmount = (text) => {
  const cleaned = String(text || "")
    .replace(/[,£$€]/g, "")
    .replace(/[^\d.-]/g, " ")
    .trim();
  const matches = [...cleaned.matchAll(/-?\d+(?:\.\d{1,2})?/g)].map((m) => Number(m[0]));
  const amount = matches.reverse().find((n) => Number.isFinite(n) && n >= 0);
  return amount ?? null;
};

const getFieldText = (field) => field?.ValueDetection?.Text || field?.LabelDetection?.Text || "";
const getFieldType = (field) => (field?.Type?.Text || "").toUpperCase();
const getFieldConfidence = (field) => field?.ValueDetection?.Confidence || field?.Type?.Confidence || 0;

const cleanItemName = (name, amount) => {
  const amountText = amount == null ? "" : String(amount).replace(".", "\\.");
  const withoutAmount = amountText ? name.replace(new RegExp(`£?${amountText}\\s*$`), "") : name;
  return withoutAmount
    .replace(/[£$€]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
};

const isLikelyExpenseItem = (name, price) => {
  if (!name || typeof name !== "string") return false;
  if (!Number.isFinite(price) || price <= 0 || price > 10000) return false;

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

const parseExpenseResponse = (res) => {
  const lines =
    res.Blocks?.filter((b) => b.BlockType === "LINE" && b.Text)
      .map((b) => b.Text)
      .filter(Boolean) || [];

  const summary = {};
  const items = [];

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
          fields.find((field) => ["PRICE", "ITEM_PRICE", "TOTAL_PRICE", "AMOUNT"].includes(getFieldType(field))) ||
          fields.find((field) => getFieldType(field).includes("PRICE") || getFieldType(field).includes("AMOUNT"));
        const rowField = fields.find((field) => getFieldType(field) === "EXPENSE_ROW");
        const nameField =
          fields.find((field) => ["ITEM", "DESCRIPTION", "PRODUCT_CODE"].includes(getFieldType(field))) ||
          rowField ||
          fields.find((field) => !parseAmount(getFieldText(field)));

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

exports.handler = async (event) => {
  const method = (event.requestContext?.http?.method || event.httpMethod || "").toUpperCase();
  if (method === "OPTIONS") return { statusCode: 200, headers: corsHeaders, body: "" };

  try {
    console.info("[ocr] raw event keys:", Object.keys(event || {}));
    const rawBody =
      typeof event.body === "string"
        ? event.isBase64Encoded
          ? Buffer.from(event.body, "base64").toString("utf-8")
          : event.body
        : event.body && typeof event.body === "object"
          ? event.body
          : "{}";
    console.info("[ocr] raw body type:", typeof rawBody, "len:", typeof rawBody === "string" ? rawBody.length : "n/a");

    let parsed = {};
    if (typeof rawBody === "string") {
      try {
        parsed = JSON.parse(rawBody || "{}");
      } catch (e) {
        console.warn("[ocr] primary body parse failed", e);
      }
    } else if (rawBody && typeof rawBody === "object") {
      parsed = rawBody;
    }

    // Support nested { body: "<json>" } as sent by some clients
    if (parsed && typeof parsed.body === "string") {
      try {
        parsed = JSON.parse(parsed.body);
        console.info("[ocr] parsed nested body");
      } catch (e) {
        console.warn("[ocr] nested body parse failed", e);
      }
    }

    console.info("[ocr] parsed keys:", Object.keys(parsed || {}));

    const imageBase64 = parsed.imageBase64;

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
    const lines = text ? text.split(/\r?\n/) : [];
    console.info("[ocr] extracted lines count:", lines.length);
    console.info("[ocr] structured items count:", items.length);
    console.info("[ocr] sample items:", items.slice(0, 5));
    console.info("[ocr] final text length:", text.length);
    console.info("[ocr] final text preview:", text.slice(0, 300));

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
