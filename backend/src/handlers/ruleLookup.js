const admin = require("firebase-admin");

let db;
function initFirestore() {
  if (db) return db;
  if (!admin.apps.length) {
    if (process.env.RULE_SA_JSON) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.RULE_SA_JSON)),
        projectId: process.env.GCLOUD_PROJECT
      });
    } else {
      admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
    }
  }
  db = admin.firestore();
  return db;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "OPTIONS,GET,POST"
};

const normalizeKeyword = (name = "") =>
  (name || "").trim().toLowerCase().split(/\s+/)[0] || "";

exports.handler = async (event) => {
  const method = (event.requestContext?.http?.method || event.httpMethod || "").toUpperCase();
  if (method === "OPTIONS") return { statusCode: 200, headers: corsHeaders, body: "" };

  try {
    let householdId = "";
    let keyword = "";

    if (method === "GET") {
      householdId = event.queryStringParameters?.householdId || "";
      keyword = event.queryStringParameters?.keyword || "";
    } else {
      const raw = typeof event.body === "string" ? event.body : "{}";
      let body = {};
      try { body = JSON.parse(raw || "{}"); } catch (_) {}
      if (body && typeof body.body === "string") {
        try { body = JSON.parse(body.body); } catch (_) {}
      }
      householdId = body.householdId || "";
      keyword = body.keyword || "";
    }

    console.info("[rule-lookup] raw body:", event.body);
    console.info("[rule-lookup] parsed body:", { householdId, keyword });

    if (!householdId || !keyword) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "householdId and keyword are required" })
      };
    }

    const norm = normalizeKeyword(keyword);
    if (!norm) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "normalized keyword is empty" })
      };
    }

    const firestore = initFirestore();
    const ruleId = `${householdId}-${norm}`;
    const ref = firestore.collection("categoryRules").doc(ruleId);

    console.info("[rule-lookup] fetching", { ruleId, householdId, keyword: norm });
    const snap = await ref.get();
    console.info("[rule-lookup] after firestore get", { exists: snap.exists });

    if (!snap.exists) {
      console.info("[rule-lookup] not found", { ruleId });
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: "not_found" }) };
    }

    const data = snap.data() || {};
    return {
      statusCode: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        category: data.category,
        source: data.source,
        confidence: data.confidence,
        keyword: data.keyword
      })
    };
  } catch (err) {
    console.error("[rule-lookup] error", err);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "rule_lookup_failed" }) };
  }
};
