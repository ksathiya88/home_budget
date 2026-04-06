// CommonJS version for Lambda (Node.js 18 default = CJS unless "type": "module")
const { TextractClient, DetectDocumentTextCommand } = require("@aws-sdk/client-textract");

const client = new TextractClient({ region: process.env.AWS_REGION || "eu-west-1" });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "OPTIONS,POST"
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
      new DetectDocumentTextCommand({
        Document: { Bytes: imageBytes }
      })
    );

    const lines =
      res.Blocks?.filter((b) => b.BlockType === "LINE" && b.Text)
        .map((b) => b.Text)
        .filter(Boolean) || [];

    console.info("[ocr] extracted lines count:", lines.length);
    console.info("[ocr] sample lines:", lines.slice(0, 5));

    const text = lines.join("\n");
    console.info("[ocr] final text length:", text.length);
    console.info("[ocr] final text preview:", text.slice(0, 300));

    return {
      statusCode: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ text })
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
