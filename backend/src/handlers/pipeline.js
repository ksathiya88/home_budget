// Lambda entrypoint for the end-to-end receipt pipeline.
// Reuses the same orchestration service as the local Express route.

const { runPipeline } = require("../services/pipelineService");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "OPTIONS,POST"
};

function parseBody(event) {
  const rawBody =
    typeof event.body === "string"
      ? event.isBase64Encoded
        ? Buffer.from(event.body, "base64").toString("utf-8")
        : event.body
      : event.body && typeof event.body === "object"
        ? event.body
        : event;

  let parsed = {};
  if (typeof rawBody === "string") {
    try {
      parsed = JSON.parse(rawBody || "{}");
    } catch (err) {
      console.warn("[pipeline] body parse failed", err);
    }
  } else if (rawBody && typeof rawBody === "object") {
    parsed = rawBody;
  }

  if (parsed && typeof parsed.body === "string") {
    try {
      parsed = JSON.parse(parsed.body);
      console.info("[pipeline] parsed nested body");
    } catch (err) {
      console.warn("[pipeline] nested body parse failed", err);
    }
  }

  return parsed || {};
}

exports.handler = async (event = {}) => {
  const method = (event.requestContext?.http?.method || event.httpMethod || "POST").toUpperCase();
  if (method === "OPTIONS") return { statusCode: 200, headers: corsHeaders, body: "" };
  if (method !== "POST") {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: "method_not_allowed" })
    };
  }

  try {
    console.info("[pipeline] raw event keys:", Object.keys(event || {}));

    const parsed = parseBody(event);
    const { imageBase64, householdId } = parsed;
    if (!imageBase64) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "imageBase64 is required" })
      };
    }

    const result = await runPipeline(imageBase64, householdId || "");

    return {
      statusCode: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify(result)
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
