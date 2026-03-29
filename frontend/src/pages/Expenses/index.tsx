import React, { useEffect, useMemo, useState } from "react";
import "./Expenses.css";
import {
  getExpenses,
  Expense,
  addExpense,
  getCategories,
  Category,
  getCategoryRules,
  CategoryRule,
  updateExpense,
  deleteExpense,
  addToReviewQueue
} from "../../services/firestore";
import { useHouseholdId } from "../../hooks/useHouseholdId";
import { applyCategoryRules } from "../../services/rules";
import { aiCategorise } from "../../services/ai";

const Expenses: React.FC = () => {
  const householdId = useHouseholdId();
  const [expenses, setExpenses] = useState<(Expense & { id?: string })[]>([]);
  const [categories, setCategories] = useState<(Category & { id?: string })[]>([]);
  const [rules, setRules] = useState<CategoryRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    item: "",
    amount: "",
    category: "",
    createdByName: ""
  });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ item: "", amount: "", category: "" });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [data, cats, loadedRules] = await Promise.all([
          getExpenses(householdId),
          getCategories(householdId),
          getCategoryRules(householdId)
        ]);
        setExpenses(data);
        setCategories(cats);
        setRules(loadedRules);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [householdId]);

  const sorted = useMemo(() => {
    return [...expenses].sort((a, b) => {
      const aDate = a.createdAt || 0;
      const bDate = b.createdAt || 0;
      return bDate - aDate;
    });
  }, [expenses]);

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

  const handleChange = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const amountNum = Number(form.amount);
    if (!form.item.trim() || !form.createdByName.trim() || Number.isNaN(amountNum) || amountNum <= 0) {
      setError("Item, amount, and created by are required. Amount must be positive.");
      return;
    }
    const ruleCategory = applyCategoryRules(form.item, rules);
    const aiResult = !ruleCategory ? aiCategorise(form.item) : null;
    const resolvedCategory = ruleCategory || form.category || aiResult?.category;
    setSaving(true);
    try {
      if (aiResult && aiResult.confidence < 0.7) {
        await addToReviewQueue({
          item: form.item.trim(),
          suggestedCategory: aiResult.category,
          confidence: aiResult.confidence,
          householdId,
          amount: amountNum,
          createdBy: "currentUser", // replace with auth user id when available
          createdByName: form.createdByName.trim(),
          weekId: currentWeekId(),
          monthId: currentMonthId(),
          createdAt: Date.now()
        });
        setSuccess("Low confidence. Sent to review queue.");
      } else {
        await addExpense({
          item: form.item.trim(),
          category: resolvedCategory || "Uncategorized",
          amount: amountNum,
          createdBy: "currentUser", // replace with auth user id when available
          createdByName: form.createdByName.trim(),
          householdId,
          weekId: currentWeekId(),
          monthId: currentMonthId(),
          createdAt: Date.now()
        });
        const categoryMsg = ruleCategory
          ? ` (rule: ${ruleCategory})`
          : aiResult
          ? ` (AI: ${aiResult.category}, ${aiResult.confidence.toFixed(2)})`
          : "";
        setSuccess(`Expense added${categoryMsg}.`);
        const updated = await getExpenses(householdId);
        setExpenses(updated);
      }
      setForm({ item: "", amount: "", category: "", createdByName: "" });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (exp: Expense & { id?: string }) => {
    if (!exp.id) return;
    setEditingId(exp.id);
    setEditForm({
      item: exp.item,
      amount: String(exp.amount),
      category: exp.category
    });
  };

  const handleEditChange =
    (field: keyof typeof editForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setEditForm((prev) => ({ ...prev, [field]: e.target.value }));
    };

  const saveEdit = async () => {
    if (!editingId) return;
    const amountNum = Number(editForm.amount);
    if (!editForm.item.trim() || !editForm.category || Number.isNaN(amountNum) || amountNum <= 0) {
      setError("Item, amount, and category are required. Amount must be positive.");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await updateExpense(editingId, {
        item: editForm.item.trim(),
        category: editForm.category,
        amount: amountNum
      });
      setEditingId(null);
      const updated = await getExpenses(householdId);
      setExpenses(updated);
      setSuccess("Expense updated.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const removeExpense = async (id?: string) => {
    if (!id) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await deleteExpense(id);
      const updated = await getExpenses(householdId);
      setExpenses(updated);
      setSuccess("Expense deleted.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <h1>Expense List</h1>
      <p className="muted">Latest expenses with category and author.</p>

      {error && <div className="error">Error: {error}</div>}
      {success && <div className="success">{success}</div>}

      <div className="panel">
        <form className="expense-form" onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Item"
            value={form.item}
            onChange={handleChange("item")}
            disabled={saving}
          />
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="Amount"
            value={form.amount}
            onChange={handleChange("amount")}
            disabled={saving}
          />
          <select value={form.category} onChange={handleChange("category")} disabled={saving}>
            <option value="">Select category</option>
            {categories.map((cat) => (
              <option key={cat.id || cat.name} value={cat.name}>
                {cat.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Created by name"
            value={form.createdByName}
            onChange={handleChange("createdByName")}
            disabled={saving}
          />
          <button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Add Expense"}
          </button>
        </form>
      </div>

      <div className="panel">
        {loading ? (
          <div>Loading…</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Created By</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr key={row.id || `${row.item}-${row.createdBy}`}>
                  <td>
                    {editingId === row.id ? (
                      <input value={editForm.item} onChange={handleEditChange("item")} />
                    ) : (
                      row.item
                    )}
                  </td>
                  <td>
                    {editingId === row.id ? (
                      <select value={editForm.category} onChange={handleEditChange("category")}>
                        <option value="">Select category</option>
                        {categories.map((cat) => (
                          <option key={cat.id || cat.name} value={cat.name}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      row.category
                    )}
                  </td>
                  <td>
                    {editingId === row.id ? (
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={editForm.amount}
                        onChange={handleEditChange("amount")}
                      />
                    ) : (
                      `$${row.amount.toFixed(2)}`
                    )}
                  </td>
                  <td>{row.createdByName || row.createdBy}</td>
                  <td className="actions">
                    {editingId === row.id ? (
                      <>
                        <button type="button" onClick={saveEdit} disabled={saving}>
                          Save
                        </button>
                        <button type="button" onClick={cancelEdit} disabled={saving}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => startEdit(row)} disabled={saving}>
                          Edit
                        </button>
                        <button type="button" onClick={() => removeExpense(row.id)} disabled={saving}>
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {!sorted.length && (
                <tr>
                  <td colSpan={5} className="muted">
                    No expenses yet.
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

export default Expenses;
