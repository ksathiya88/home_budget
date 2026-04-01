import React, { useEffect, useMemo, useState } from "react";
import "./Budgets.css";
import { addOrUpdateBudget, getBudgets, getCategories, Budget, Category } from "../../services/firestore";
import { useHouseholdId } from "../../hooks/useHouseholdId";
import Loader from "../../components/Loader";
import EmptyState from "../../components/EmptyState";

type BudgetWithName = Budget & { categoryName?: string };

const Budgets: React.FC = () => {
  const householdId = useHouseholdId();
  const [categories, setCategories] = useState<(Category & { id?: string })[]>([]);
  const [budgets, setBudgets] = useState<BudgetWithName[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [limit, setLimit] = useState<string>("");
  const [period, setPeriod] = useState<Budget["period"]>("monthly");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const categoryMap = useMemo(() => {
    const map: Record<string, string> = {};
    categories.forEach((c) => {
      if (c.id) map[c.id] = c.name;
    });
    return map;
  }, [categories]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [cats, buds] = await Promise.all([getCategories(householdId), getBudgets(householdId)]);
      setCategories(cats as (Category & { id?: string })[]);
      const withNames: BudgetWithName[] = buds.map((b) => ({
        ...b,
        categoryName: categoryMap[b.categoryId]
      }));
      // If categoryMap not ready yet (first load), map after categories resolved.
      setBudgets(withNames);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [householdId]);

  // Update budget names when categories fetched
  useEffect(() => {
    setBudgets((prev) =>
      prev.map((b) => ({
        ...b,
        categoryName: categoryMap[b.categoryId] || b.categoryId
      }))
    );
  }, [categoryMap]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!selectedCategoryId) {
      setError("Select a category.");
      return;
    }
    const limitValue = Number(limit);
    if (Number.isNaN(limitValue) || limitValue <= 0) {
      setError("Enter a positive limit.");
      return;
    }
    setLoading(true);
    try {
      await addOrUpdateBudget({
        categoryId: selectedCategoryId,
        limit: limitValue,
        period,
        householdId
      });
      setSuccess("Budget saved.");
      setLimit("");
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <h1>Budgets</h1>
      <p className="muted">Configure one budget per category and period.</p>

      <div className="panel">
        <form className="budget-form" onSubmit={handleSubmit}>
          <label>
            Category
            <select
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              disabled={loading}
            >
              <option value="">Select category</option>
              {categories
                .filter((c) => c.active !== false)
                .map((c) => (
                  <option key={c.id || c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Limit
            <input
              type="number"
              min="0"
              step="0.01"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              disabled={loading}
            />
          </label>
          <label>
            Period
            <select value={period} onChange={(e) => setPeriod(e.target.value as Budget["period"])} disabled={loading}>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          <button type="submit" disabled={loading}>
            {loading ? "Saving..." : "Save Budget"}
          </button>
        </form>
        {error && <div className="error">{error}</div>}
        {success && <div className="success">{success}</div>}
      </div>

      <div className="panel">
        {loading ? (
          <Loader />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Limit</th>
                <th>Period</th>
              </tr>
            </thead>
            <tbody>
              {budgets.map((budget) => (
                <tr key={`${budget.categoryId}-${budget.period}`}>
                  <td>{budget.categoryName || budget.categoryId}</td>
                  <td>${budget.limit.toFixed(2)}</td>
                  <td>{budget.period}</td>
                </tr>
              ))}
              {!budgets.length && (
                <tr>
                  <td colSpan={3}>
                    <EmptyState title="No budgets yet" message="Add a budget to track spend against limits." />
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

export default Budgets;
