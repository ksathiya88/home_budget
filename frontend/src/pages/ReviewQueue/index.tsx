import React, { useEffect, useState } from "react";
import "./ReviewQueue.css";
import {
  getReviewQueue,
  deleteFromReviewQueue,
  addExpense,
  upsertCategoryRule,
  getCategories,
  Category,
  ReviewQueueItem
} from "../../services/firestore";
import { useHouseholdId } from "../../hooks/useHouseholdId";
import Loader from "../../components/Loader";
import EmptyState from "../../components/EmptyState";

type QueueEntry = ReviewQueueItem & { id?: string };

const ReviewQueue: React.FC = () => {
  const householdId = useHouseholdId();
  const [items, setItems] = useState<QueueEntry[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, { category: string; amount: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [queue, cats] = await Promise.all([getReviewQueue(householdId), getCategories(householdId)]);
      setItems(queue);
      setCategories(cats);
      const defaults: Record<string, { category: string; amount: string }> = {};
      queue.forEach((q) => {
        const key = q.id || "__noid__";
        defaults[key] = { category: q.suggestedCategory, amount: q.amount != null ? q.amount.toString() : "" };
      });
      setEdits(defaults);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [householdId]);

  const updateEdit = (id: string, field: "category" | "amount", value: string) => {
    const key = id || "__noid__";
    setEdits((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), [field]: value } }));
  };

  const approve = async (entry: QueueEntry) => {
    if (!entry.id) return;
    const key = entry.id || "__noid__";
    const edit =
      edits[key] || { category: entry.suggestedCategory, amount: entry.amount != null ? entry.amount.toString() : "" };
    const amountNum = Number(edit.amount);
    if (!edit.category || Number.isNaN(amountNum) || amountNum <= 0) {
      setError("Category and positive amount required to approve.");
      return;
    }
    setSavingId(entry.id);
    setError(null);
    setSuccess(null);
    try {
      await addExpense({
        item: entry.item,
        category: edit.category,
        amount: amountNum,
        createdBy: entry.createdBy || "currentUser",
        createdByName: entry.createdByName || "Unknown",
        householdId: entry.householdId,
        weekId: entry.weekId || "",
        monthId: entry.monthId || "",
        createdAt: entry.createdAt || Date.now()
      });
      await upsertCategoryRule(entry.householdId, entry.item, edit.category);
      await deleteFromReviewQueue(entry.id);
      setSuccess("Approved and saved.");
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingId(null);
    }
  };

  const discard = async (entry: QueueEntry) => {
    if (!entry.id) return;
    setSavingId(entry.id);
    setError(null);
    setSuccess(null);
    try {
      await deleteFromReviewQueue(entry.id);
      setSuccess("Discarded.");
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="page">
      <h1>Review Queue</h1>
      <p className="muted">Low-confidence items sent for manual review. Approve or discard.</p>

      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      <div className="panel">
        {loading ? (
          <Loader />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Amount</th>
                <th>Suggested Category</th>
                <th>Confidence</th>
                <th>Created By</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((entry) => (
                <tr key={entry.id || entry.item}>
                  <td>{entry.item}</td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={
                        edits[entry.id || "__noid__"]?.amount ??
                        (entry.amount != null ? entry.amount.toString() : "")
                      }
                      onChange={(e) => updateEdit(entry.id || "__noid__", "amount", e.target.value)}
                    />
                  </td>
                  <td>
                    <select
                      value={edits[entry.id || "__noid__"]?.category ?? entry.suggestedCategory}
                      onChange={(e) => updateEdit(entry.id || "__noid__", "category", e.target.value)}
                    >
                      <option value="">Select category</option>
                      {categories.map((cat) => (
                        <option key={cat.id || cat.name} value={cat.name}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{(entry.confidence * 100).toFixed(0)}%</td>
                  <td>{entry.createdByName || entry.createdBy}</td>
                  <td className="actions">
                    <button type="button" onClick={() => approve(entry)} disabled={savingId === entry.id}>
                      Approve
                    </button>
                    <button type="button" onClick={() => discard(entry)} disabled={savingId === entry.id}>
                      Discard
                    </button>
                  </td>
                </tr>
              ))}
              {!items.length && (
                <tr>
                  <td colSpan={6}>
                    <EmptyState title="Nothing to review" message="Low-confidence items will show up here." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default ReviewQueue;
