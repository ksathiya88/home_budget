// Simple Express server to expose the pipeline locally at /api/pipeline
// Requires: npm install express

const express = require("express");
const pipelineRoute = require("./routes/pipelineRoute");

const app = express();
const port = process.env.PORT || 4000;

app.use(express.json({ limit: "10mb" }));
app.use("/api", pipelineRoute);

// Healthcheck
app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend API listening on http://localhost:${port}`);
});
