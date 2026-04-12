# Home Budget AI Pipeline

End-to-end receipt ingestion and categorization with AWS + Firebase + React. Upload a receipt → Textract OCR → parse line items → Bedrock LLM categorization → confidence-gated rule learning → Firestore storage and review queue.

## Why it’s interesting
- **Cost- and latency-aware**: rule-first matching + AI-to-rule learning to skip repeat LLM calls.
- **Production-grade flow**: confidence thresholds, review queue for low-confidence items, explicit logging and CORS, Lambda cold-start mitigations.
- **Composable**: separate Lambdas for OCR, categorize, rule create, and rule lookup; Express orchestrator; React “OCR Pipeline” page to exercise the flow.

## Architecture at a glance
- **Frontend**: React (Create React App). OCR Pipeline page lets you upload images, view extracted text, see per-item categories/confidence, and auto-save or queue items.
- **Backend (Express)**: `/api/pipeline` orchestrates OCR → extractData → rule lookup → Bedrock categorize → rule creation → returns items.
- **Lambdas**:
  - `ocrAgent` (Textract DetectDocumentText)
  - `aiCategorize` (Bedrock LLM)
  - `ruleLookup` (Firestore read, householdId+keyword)
  - `ruleCreate` (Firestore upsert, confidence-gated)
- **Shared utils**:
  - `extractData` (regex line parser, currency handling, stop-at-total)
  - Rule learning threshold (currently 0.75 confidence).
- **Data**: Firestore (`expenses`, `reviewQueue`, `categoryRules`).

## Key behaviors
- **Rule-first**: If `RULE_LOOKUP_URL` returns a rule, AI is skipped; source=RULE, confidence=1.0.
- **AI fallback**: Calls `aiCategorize` when no rule match; source=AI.
- **Rule learning**: If AI confidence ≥ 0.75, pipeline calls `ruleCreate` Lambda to persist a rule (does not overwrite USER rules).
- **Review gating**: Items below save threshold go to review queue; others auto-save with confidence.

## Getting started (local)
1. **Backend**
   - `cd backend && npm install express` (and `firebase-admin` if you’ll run rules locally).
   - Set envs (or .env):
     - `OCR_URL`, `CATEGORIZE_URL`, `RULE_CREATE_URL`, `RULE_LOOKUP_URL`
   - `node src/server.js` (serves `/api/pipeline` on port 4000).
2. **Frontend**
   - `cd frontend && npm install`
   - `npm start` (proxy set to `http://localhost:4000` for `/api`).
3. **Lambdas**
   - Deploy `ruleCreate.js` and `ruleLookup.js` with envs:
     - `RULE_SA_JSON` (service account JSON), `GCLOUD_PROJECT` (Firebase project ID)
   - Increase timeout (~15s) and memory (512 MB). No VPC required.

## Quick demo flow (5 min)
1. Start backend and frontend (`localhost:3000` → “OCR Pipeline” in sidebar).
2. Upload a sample receipt image.
3. Observe:
   - Extracted text block
   - Items table with category + confidence
   - “Saving results…” status; high-confidence items auto-save, low-confidence go to review queue.
4. Re-run the same item: rule lookup should short-circuit AI (source=RULE).

## Notable implementation details
- **Parsing**: `extractData` strips currency symbols, stops at “TOTAL”, pairs name/price, skips promo/footer noise.
- **Confidence thresholds**: 0.75 for rule creation; 0.7 for save vs review (in frontend auto-save).
- **Logging**: Each Lambda logs raw/parsed bodies and Firestore reads/writes; pipeline logs rule hits, AI skips, and rule creation calls.

## Project structure (selected)
```
backend/
  src/handlers/
    aiCategorize.ts      # Bedrock categorize Lambda
    ocrAgent.js          # Textract OCR Lambda (CJS)
    ocrAgent.ts          # Textract OCR Lambda (TS source)
    extractData.js       # OCR text parser
    ruleCreate.js        # Rule creation Lambda (Firestore upsert)
    ruleLookup.js        # Rule lookup Lambda (Firestore read)
  src/services/
    pipelineService.js   # Orchestrator (used by Express)
    pipelineService.ts   # TS version (frontend client mirror)
  src/routes/
    pipelineRoute.js     # POST /api/pipeline (Express)
    pipelineRoute.ts     # TS source
  src/server.js          # Local Express runner (mounts /api/pipeline)
  README.md              # Backend-specific notes

frontend/
  src/pages/OcrPipeline/ # Upload & test page
  src/services/
    pipelineService.ts   # Frontend client for /api/pipeline
    expenseService.ts    # Save vs review logic
  src/firebase.ts        # Frontend Firebase config
  src/components/Sidebar.tsx
  src/App.tsx
  README.md              # Frontend-specific notes
