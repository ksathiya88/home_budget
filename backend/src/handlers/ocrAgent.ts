import { TextractClient, DetectDocumentTextCommand } from "@aws-sdk/client-textract";

const client = new TextractClient({ region: process.env.AWS_REGION || "eu-west-1" });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "OPTIONS,POST"
};

type Event = {
  body?: string | null;
  httpMethod?: string;
  requestContext?: { http?: { method?: string } };
};

export const handler = async (event: Event) => {
  const method =
    (event.requestContext?.http?.method || event.httpMethod || "").toUpperCase();
  if (method === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

  try {
    const rawBody = typeof event.body === "string" ? event.body : "{}";
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
      new DetectDocumentTextCommand({
        Document: { Bytes: imageBytes }
      })
    );

    const lines =
      res.Blocks?.filter((b) => b.BlockType === "LINE" && b.Text)
        .map((b) => b.Text as string)
        .filter(Boolean) || [];

    console.info("[ocr] extracted lines:", lines);

    const text = lines.join("\n");
    console.info("[ocr] final text length:", text.length);

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
