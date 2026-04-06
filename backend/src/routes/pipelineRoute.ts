import { Router } from "express";
import { runPipeline } from "../services/pipelineService";

const router = Router();

router.post("/pipeline", async (req, res) => {
  try {
    const { imageBase64 } = req.body || {};
    if (!imageBase64) {
      return res.status(400).json({ error: "imageBase64 is required" });
    }
    const result = await runPipeline(imageBase64);
    res.json(result);
  } catch (err) {
    console.error("[pipelineRoute] error", err);
    res.status(500).json({ error: "pipeline_failed" });
  }
});

export default router;
