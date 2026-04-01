import React, { useEffect, useMemo, useState } from "react";
import "./UploadReceipt.css";
import { getCategoryRules, CategoryRule } from "../../services/firestore";
import { useHouseholdId } from "../../hooks/useHouseholdId";
import { processExpense } from "../../services/expenseService";
import { applyCategoryRules } from "../../services/rules";
import { aiCategorise, AiResult } from "../../services/aiService";

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
  const [aiResults, setAiResults] = useState<Record<string, AiResult>>({});
  const [aiLoading, setAiLoading] = useState<Record<string, boolean>>({});

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

  // Clear cached AI results when rules change (they affect matching)
  useEffect(() => {
    setAiResults({});
    setAiLoading({});
  }, [rules]);

  // Fetch AI categorisations for items that don't hit rules
  useEffect(() => {
    parsedItems.forEach((p) => {
      const ruleCategory = applyCategoryRules(p.item, rules);
      if (ruleCategory) return;
      if (aiResults[p.item] || aiLoading[p.item]) return;

      setAiLoading((prev) => ({ ...prev, [p.item]: true }));
      void aiCategorise(p.item, rules)
        .then((res) => {
          setAiResults((prev) => ({ ...prev, [p.item]: res }));
        })
        .catch((err) => {
          console.warn("[UploadReceipt] aiCategorise error", err);
        })
        .finally(() => {
          setAiLoading((prev) => {
            const next = { ...prev };
            delete next[p.item];
            return next;
          });
        });
    });
  }, [parsedItems, rules, aiResults, aiLoading]);

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
        const result = await processExpense(
          {
            item: item.item,
            amount: item.amount || 0,
            createdBy: "currentUser", // replace with auth user id
            createdByName: createdByName.trim(),
            householdId,
            weekId: currentWeekId(),
            monthId: currentMonthId(),
            createdAt: Date.now()
          },
          rules
        );
        if (result.status === "queued") {
          queued += 1;
        } else {
          saved += 1;
        }
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
        const aiResult = !ruleCategory ? aiResults[p.item] : null;
        const loading = !ruleCategory && aiLoading[p.item];
        const resolvedCategory = ruleCategory || aiResult?.category || (loading ? "…" : "Uncategorized");
        const confidence = ruleCategory ? 1 : aiResult?.confidence ?? (loading ? 0.5 : 0.5);
        return {
          ...p,
          resolvedCategory,
          confidence,
          lowConfidence: !ruleCategory && (aiResult ? confidence < 0.7 : true),
          loading
        };
      }),
    [parsedItems, rules, aiResults, aiLoading]
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
