import React, { useEffect, useMemo, useState } from "react";
import "./UploadReceipt.css";
import {
  getCategoryRules,
  CategoryRule,
  addExpense,
  addToReviewQueue
} from "../../services/firestore";
import { useHouseholdId } from "../../hooks/useHouseholdId";
import { applyCategoryRules } from "../../services/rules";
import { aiCategorise } from "../../services/ai";

type ParsedItem = { item: string; amount: number };

const UploadReceipt: React.FC = () => {
  const householdId = useHouseholdId();
  const [fileName, setFileName] = useState<string>("");
  const [ocrText, setOcrText] = useState<string>("");
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [rules, setRules] = useState<CategoryRule[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [createdByName, setCreatedByName] = useState("");

  useEffect(() => {
    const loadRules = async () => {
      try {
        const loaded = await getCategoryRules(householdId);
        setRules(loaded);
      } catch (err) {
        setError((err as Error).message);
      }
    };
    void loadRules();
  }, [householdId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
  };

  const parseText = () => {
    const lines = ocrText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const items: ParsedItem[] = lines.map((line) => {
      const match = line.match(/([\d]+(\.\d+)?)(?!.*[\d])/);
      const amount = match ? Number(match[1]) : 0;
      const itemName = line.replace(match?.[0] || "", "").trim() || line;
      return { item: itemName, amount };
    });
    setParsedItems(items);
    setStatus(`Parsed ${items.length} line(s).`);
  };

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

  const processItems = async () => {
    if (!parsedItems.length) {
      setError("Parse text first.");
      return;
    }
    if (!createdByName.trim()) {
      setError("Created by name is required.");
      return;
    }
    setError(null);
    setStatus(null);
    setProcessing(true);
    let saved = 0;
    let queued = 0;
    try {
      for (const item of parsedItems) {
        const ruleCategory = applyCategoryRules(item.item, rules);
        const aiResult = !ruleCategory ? aiCategorise(item.item) : null;
        const resolvedCategory = ruleCategory || aiResult?.category || "Uncategorized";

        if (aiResult && aiResult.confidence < 0.7 && !ruleCategory) {
          await addToReviewQueue({
            item: item.item,
            suggestedCategory: aiResult.category,
            confidence: aiResult.confidence,
            householdId,
            amount: item.amount || 0,
            createdBy: "currentUser", // replace with auth user id
            createdByName: createdByName.trim(),
            weekId: currentWeekId(),
            monthId: currentMonthId(),
            createdAt: Date.now()
          });
          queued += 1;
          continue;
        }

        await addExpense({
          item: item.item,
          category: resolvedCategory,
          amount: item.amount || 0,
          createdBy: "currentUser", // replace with auth user id
          createdByName: createdByName.trim(),
          householdId,
          weekId: currentWeekId(),
          monthId: currentMonthId(),
          createdAt: Date.now()
        });
        saved += 1;
      }
      setStatus(`Saved ${saved} item(s). Sent ${queued} to review.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setProcessing(false);
    }
  };

  const preview = useMemo(
    () =>
      parsedItems.map((p, idx) => {
        const ruleCategory = applyCategoryRules(p.item, rules);
        const aiResult = !ruleCategory ? aiCategorise(p.item) : null;
        const resolvedCategory = ruleCategory || aiResult?.category || "Uncategorized";
        const confidence = ruleCategory ? 1 : aiResult?.confidence ?? 0.5;
        return {
          ...p,
          resolvedCategory,
          confidence,
          lowConfidence: !ruleCategory && confidence < 0.7
        };
      }),
    [parsedItems, rules]
  );

  return (
    <div className="page">
      <h1>Upload Receipt</h1>
      <p className="muted">
        Upload a receipt image (UI only), paste extracted text, parse lines, then auto-categorize using rules or AI.
      </p>

      {error && <div className="error">{error}</div>}
      {status && <div className="success">{status}</div>}

      <div className="panel upload-panel">
        <label className="file-picker">
          <input type="file" accept="image/*" onChange={handleFileChange} />
          <span>{fileName || "Choose receipt image"}</span>
        </label>
        <textarea
          rows={6}
          placeholder="Paste extracted text here (simulate Textract output)..."
          value={ocrText}
          onChange={(e) => setOcrText(e.target.value)}
        />
        <input
          type="text"
          placeholder="Created by name"
          value={createdByName}
          onChange={(e) => setCreatedByName(e.target.value)}
        />
        <div className="actions-row">
          <button type="button" onClick={parseText} disabled={processing}>
            Parse Text
          </button>
          <button type="button" onClick={processItems} disabled={processing}>
            {processing ? "Processing..." : "Send to Pipeline"}
          </button>
        </div>
      </div>

      <div className="panel">
        <h3>Parsed Items</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Amount</th>
              <th>Resolved Category</th>
              <th>Confidence</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {preview.map((p, idx) => (
              <tr key={idx}>
                <td>{p.item}</td>
                <td>${p.amount.toFixed(2)}</td>
                <td>{p.resolvedCategory}</td>
                <td>{(p.confidence * 100).toFixed(0)}%</td>
                <td className={p.lowConfidence ? "over" : ""}>
                  {p.lowConfidence ? "Review Queue" : "Will Save"}
                </td>
              </tr>
            ))}
            {!preview.length && (
              <tr>
                <td colSpan={5} className="muted">
                  Nothing parsed yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default UploadReceipt;
