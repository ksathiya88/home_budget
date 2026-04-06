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
  "Access-Control-Allow-Methods": "OPTIONS,POST"
};

const normalizeKeyword = (name = "") =>
  (name || "").trim().toLowerCase().split(/\s+/)[0] || "";

exports.handler = async (event) => {
  const method = (event.requestContext?.http?.method || event.httpMethod || "").toUpperCase();
  if (method === "OPTIONS") return { statusCode: 200, headers: corsHeaders, body: "" };

  try {
    const raw = typeof event.body === "string" ? event.body : "{}";
    let body = {};
    try { body = JSON.parse(raw || "{}"); } catch (_) {}
    if (body && typeof body.body === "string") {
      try { body = JSON.parse(body.body); } catch (_) {}
    }

    console.info("[rule-create] raw body:", event.body);
    console.info("[rule-create] parsed body:", body);
    console.info("[rule-create] projectId from SA:", (() => {
      try { return JSON.parse(process.env.RULE_SA_JSON || "{}").project_id; } catch (_) { return "parse-failed"; }
    })());
    console.info("[rule-create] GCLOUD_PROJECT:", process.env.GCLOUD_PROJECT);

    const { itemName, category, confidence, householdId } = body || {};
    if (!itemName || !category || typeof confidence !== "number" || !householdId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "itemName, category, confidence, householdId are required" })
      };
    }

    const keyword = normalizeKeyword(itemName);
    if (!keyword) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "normalized keyword is empty" })
      };
    }

    const firestore = initFirestore();
    const ruleId = `${householdId}-${keyword}`;
    const ref = firestore.collection("categoryRules").doc(ruleId);

    console.info("[rule-create] before firestore get", { ruleId });
    const snap = await ref.get();
    console.info("[rule-create] after firestore get");

    if (snap.exists) {
      const data = snap.data() || {};
      if (data.source === "USER") {
        console.info("[rule-create] existing USER rule; skip", { ruleId });
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ status: "skipped_user_rule" }) };
      }
      if (data.category === category && data.source === "AI") {
        console.info("[rule-create] duplicate AI rule; skip", { ruleId });
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ status: "skipped_duplicate" }) };
      }
    }

    console.info("[rule-create] before firestore set", { ruleId, category, confidence });
    await ref.set(
      {
        keyword,
        category,
        source: "AI",
        confidence,
        householdId,
        updatedAt: Date.now()
      },
      { merge: true }
    );
    console.info("[rule-create] after firestore set");

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ status: "created", ruleId, keyword, category, confidence })
    };
  } catch (err) {
    console.error("[rule-create] error", err);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "rule_create_failed" }) };
  }
};
