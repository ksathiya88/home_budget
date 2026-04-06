const express = require("express");
const { runPipeline } = require("../services/pipelineService");

const router = express.Router();

router.post("/pipeline", async (req, res) => {
  try {
    const { imageBase64, householdId } = req.body || {};
    if (!imageBase64) {
      return res.status(400).json({ error: "imageBase64 is required" });
    }
    const result = await runPipeline(imageBase64, householdId || "");
    res.json(result);
  } catch (err) {
    console.error("[pipelineRoute] error", err);
    res.status(500).json({ error: "pipeline_failed" });
  }
});

module.exports = router;
