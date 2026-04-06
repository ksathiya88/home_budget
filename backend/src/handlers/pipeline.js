// End-to-end pipeline: OCR (via OCR Lambda) -> extractData -> categorizeItem (via aiCategorize Lambda).
// CommonJS, CORS-enabled.

const { extractData } = require("./extractData");
// OCR and Categorisation call existing Lambdas via HTTP.

const OCR_URL =
  process.env.OCR_URL ||
  "https://by42fu2friqj6js7gx6fgl5zju0aoxbt.lambda-url.eu-west-1.on.aws/";
const CATEGORIZE_URL =
  process.env.CATEGORIZE_URL ||
  "https://nihg6j62qaznkflj7j4tvb2lwa0clrbe.lambda-url.eu-west-1.on.aws/";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "OPTIONS,POST"
};

exports.handler = async (event) => {
  const method = (event.requestContext?.http?.method || event.httpMethod || "").toUpperCase();
  if (method === "OPTIONS") return { statusCode: 200, headers: corsHeaders, body: "" };

  try {
    console.info("[pipeline] raw event keys:", Object.keys(event || {}));

    const rawBody =
      typeof event.body === "string"
        ? event.isBase64Encoded
          ? Buffer.from(event.body, "base64").toString("utf-8")
          : event.body
        : event.body && typeof event.body === "object"
          ? event.body
          : "{}";

    let parsed = {};
    if (typeof rawBody === "string") {
      try {
        parsed = JSON.parse(rawBody || "{}");
      } catch (e) {
        console.warn("[pipeline] primary body parse failed", e);
      }
    } else if (rawBody && typeof rawBody === "object") {
      parsed = rawBody;
    }

    if (parsed && typeof parsed.body === "string") {
      try {
        parsed = JSON.parse(parsed.body);
        console.info("[pipeline] parsed nested body");
      } catch (e) {
        console.warn("[pipeline] nested body parse failed", e);
      }
    }

    const imageBase64 = parsed.imageBase64;
    if (!imageBase64) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "imageBase64 is required" })
      };
    }

    // Step 1: OCR via OCR Lambda
    let text = "";
    try {
      const ocrRes = await fetch(OCR_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64 })
      });
      if (ocrRes.ok) {
        const data = await ocrRes.json();
        text = data?.text || "";
      } else {
        const body = await ocrRes.text();
        throw new Error(`OCR lambda non-ok ${ocrRes.status}: ${body}`);
      }
    } catch (err) {
      console.warn("[pipeline] OCR lambda error", err);
      throw err;
    }

    console.info("[pipeline] OCR text length:", text.length);
    console.info("[pipeline] OCR text preview:", text.slice(0, 300));

    // Step 2: Extraction
    const extracted = extractData(text);
    console.info("[pipeline] extracted items:", extracted.items);

    // Step 3: Categorisation
    const itemsWithCategory = [];
    for (const item of extracted.items) {
      let category = "Miscellaneous";
      let confidence = 0.5;
      try {
        const res = await fetch(CATEGORIZE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ item: item.name, amount: item.price })
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.category && typeof data.confidence === "number") {
            category = data.category;
            confidence = data.confidence;
          }
        } else {
          console.warn("[pipeline] categorize lambda non-ok", { status: res.status });
        }
      } catch (err) {
        console.warn("[pipeline] categorize lambda error", err);
      }

      itemsWithCategory.push({
        ...item,
        category,
        confidence
      });
      console.info("[pipeline] categorized", { item: item.name, category, confidence });
    }

    const responseBody = {
      text,
      items: itemsWithCategory
    };

    return {
      statusCode: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify(responseBody)
    };
  } catch (err) {
    console.error("[pipeline] error", err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: "pipeline_failed" })
    };
  }
};
