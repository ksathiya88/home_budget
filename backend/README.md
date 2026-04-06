Node.js Lambda handlers behind API Gateway.

Handlers:
- `src/handlers/aiCategorize.ts` — expense categorisation via Bedrock.
- `src/handlers/ocrAgent.ts` — OCR agent (TypeScript source) using Textract DetectDocumentText; input `{ "imageBase64": "..." }`, returns `{ "text": "..." }`, CORS-ready.
- `src/handlers/ocrAgent.js` — CommonJS version for direct Lambda upload (use this if you see “Cannot use import statement outside a module”).
- `src/handlers/extractData.js` — Pure JS OCR text post-processor; exports `extractData(text)` returning `{ items: [{ name, price }] }`.
- `src/handlers/categorizeAgent.js` — Simple keyword-based categoriser; exports `categorizeItem(name)`.
- `src/handlers/pipeline.js` — End-to-end Lambda: OCR (Textract) → extractData → categorizeItem; input `{ "imageBase64": "..." }`, returns `{ text, items: [{ name, price, category, confidence }] }`, CORS-ready.
- `src/handlers/ruleCreate.js` — Rule creation Lambda (Firestore upsert) for high-confidence AI results.
- `src/handlers/ruleLookup.js` — Rule lookup Lambda returning a rule for householdId/keyword.
- `src/services/pipelineService.ts` — Reusable pipeline using OCR & categorize Lambdas.
- `src/routes/pipelineRoute.ts` — Express route `POST /api/pipeline` to run the pipeline.
- `src/services/pipelineService.js` — CommonJS runtime version.
- `src/routes/pipelineRoute.js` — CommonJS Express route for runtime.
- `src/server.js` — Minimal Express server mounting `/api/pipeline`. Start with `node src/server.js` (after `npm install express`). Set `OCR_URL` and `CATEGORIZE_URL` env vars as needed.
