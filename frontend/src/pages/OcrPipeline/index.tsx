import React, { useEffect, useMemo, useState } from "react";
import "./OcrPipeline.css";
import { runPipeline, PipelineResult } from "../../services/pipelineService";
import { getCategoryRules, CategoryRule, addToReviewQueue, addExpense } from "../../services/firestore";
import { useHouseholdId } from "../../hooks/useHouseholdId";

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",").pop() || "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const OcrPipeline: React.FC = () => {
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createdByName, setCreatedByName] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [rules, setRules] = useState<CategoryRule[]>([]);
  const householdId = useHouseholdId();

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setError(null);
    const base64 = await fileToBase64(file);
    setPreview(base64 ? `data:${file.type || "image/*"};base64,${base64}` : null);
  };

  const run = async () => {
    if (!preview) {
      setError("Select an image first.");
      return;
    }
    setLoading(true);
    setStatus("Running pipeline...");
    setError(null);
    setResult(null);
    try {
      const base64 = preview.split(",").pop() || "";
      const res = await runPipeline(base64, householdId);
      setResult(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
      setStatus(null);
    }
  };

  useEffect(() => {
    const loadRules = async () => {
      try {
        const r = await getCategoryRules(householdId);
        setRules(r);
      } catch (err) {
        console.warn("[OcrPipeline] load rules error", err);
      }
    };
    void loadRules();
  }, [householdId]);

  const currentWeekId = () => {
    const now = new Date();
    const target = new Date(now.valueOf());
    const dayNr = (now.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNr + 3);
    const firstThursday = new Date(target.getFullYear(), 0, 4);
    const weekNumber =
      1 +
      Math.round(
        ((target.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) /
          7
      );
    return `${target.getFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
  };

  const currentMonthId = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  };

  const autoSave = useMemo(
    () => async (pipeline: PipelineResult) => {
      if (!householdId) return;
      if (!createdByName.trim()) {
        setStatus("Enter Created by name to save.");
        return;
      }
      setSaving(true);
      let saved = 0;
      let queued = 0;
      try {
        for (const it of pipeline.items) {
          const input = {
            item: it.name,
            amount: it.price || 0,
            createdBy: "pipeline",
            createdByName: createdByName.trim(),
            householdId,
            weekId: currentWeekId(),
            monthId: currentMonthId(),
            createdAt: Date.now()
          };
          // Apply same logic as processExpense: confidence gate 0.7
          if (it.confidence >= 0.7) {
            await addExpense({
              ...input,
              category: it.category,
              confidence: it.confidence,
              source: "ai",
              needsReview: false
            });
            saved += 1;
          } else {
            await addToReviewQueue({
              item: input.item,
              amount: input.amount,
              suggestedCategory: it.category,
              confidence: it.confidence,
              householdId: input.householdId,
              createdBy: input.createdBy,
              createdByName: input.createdByName,
              weekId: input.weekId,
              monthId: input.monthId,
              createdAt: input.createdAt
            });
            queued += 1;
          }
        }
        setStatus(`Saved ${saved} item(s). Sent ${queued} to review.`);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setSaving(false);
      }
    },
    [createdByName, householdId]
  );

  useEffect(() => {
    if (result) {
      void autoSave(result);
    }
  }, [result, autoSave]);

  return (
    <div className="page">
      <h1>OCR Pipeline Test</h1>
      <p className="muted">
        Upload an image, run Textract → extractData → aiCategorize Lambda, and view structured output.
      </p>

      {error && <div className="error">{error}</div>}
      {status && !error && <div className="success">{status}</div>}
      {result && !error && !status && <div className="success">Pipeline succeeded.</div>}

      <div className="panel upload-panel">
        <label className="file-picker">
          <input type="file" accept="image/*" onChange={onFileChange} />
          <span>{fileName || "Choose image"}</span>
        </label>
        <input
          type="text"
          placeholder="Created by name"
          value={createdByName}
          onChange={(e) => setCreatedByName(e.target.value)}
        />
        <button type="button" onClick={run} disabled={loading}>
          {loading ? "Running..." : "Run Pipeline"}
        </button>
        {saving && <span className="muted">Saving results...</span>}
      </div>

      {preview && (
        <div className="panel preview">
          <h3>Preview</h3>
          <img src={preview} alt="preview" className="preview-img" />
        </div>
      )}

      {result && (
        <div className="panel">
          <h3>Extracted Text</h3>
          <pre className="text-block">{result.text || "(none)"}</pre>

          <h3>Items</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Price</th>
                <th>Category</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((it, idx) => (
                <tr key={idx}>
                  <td>{it.name}</td>
                  <td>{it.price}</td>
                  <td>{it.category}</td>
                  <td>{(it.confidence * 100).toFixed(0)}%</td>
                </tr>
              ))}
              {!result.items.length && (
                <tr>
                  <td colSpan={4} className="muted">
                    No items extracted.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default OcrPipeline;
