import React, { useEffect, useMemo, useState } from "react";
import "./Categories.css";
import {
  addCategory,
  getCategories,
  Category,
  getCategoryRules,
  addCategoryRule,
  CategoryRule
} from "../../services/firestore";
import { useHouseholdId } from "../../hooks/useHouseholdId";
import Loader from "../../components/Loader";
import EmptyState from "../../components/EmptyState";

const Categories: React.FC = () => {
  const householdId = useHouseholdId();
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [rules, setRules] = useState<(CategoryRule & { id?: string })[]>([]);
  const [ruleForm, setRuleForm] = useState({ keyword: "", category: "" });

  const existingNames = useMemo(
    () => new Set(categories.map((c) => c.name.trim().toLowerCase())),
    [categories]
  );

  const loadCategories = async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, loadedRules] = await Promise.all([
        getCategories(householdId),
        getCategoryRules(householdId)
      ]);
      setCategories(data);
      setRules(loadedRules);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCategories();
  }, [householdId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required.");
      return;
    }
    if (existingNames.has(trimmed.toLowerCase())) {
      setError("Category name already exists.");
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await addCategory({ name: trimmed, active: true, householdId });
      setName("");
      setSuccess("Category added.");
      await loadCategories();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleRuleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const keyword = ruleForm.keyword.trim();
    if (!keyword || !ruleForm.category) {
      setError("Keyword and category are required for a rule.");
      return;
    }
    setLoading(true);
    try {
      await addCategoryRule({
        keyword,
        category: ruleForm.category,
        householdId
      });
      setRuleForm({ keyword: "", category: "" });
      setSuccess("Rule added.");
      await loadCategories();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <h1>Categories</h1>
      <p className="muted">Manage category list scoped by householdId. One category → one budget type.</p>

      <div className="panel">
        <form className="category-form" onSubmit={handleAdd}>
          <input
            type="text"
            placeholder="New category name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={loading}
          />
          <button type="submit" disabled={loading}>
            {loading ? "Saving..." : "Add"}
          </button>
        </form>
        {error && <div className="error">{error}</div>}
        {success && <div className="success">{success}</div>}
      </div>

      <div className="panel">
        {loading ? (
          <Loader />
        ) : (
          <ul className="category-list">
            {categories.map((cat) => (
              <li key={cat.name} className={cat.active ? "" : "inactive"}>
                {cat.name}
                <span className="status">{cat.active ? "Active" : "Inactive"}</span>
              </li>
            ))}
            {!categories.length && (
              <li>
                <EmptyState title="No categories" message="Add your first category to get started." />
              </li>
            )}
          </ul>
        )}
      </div>

      <div className="panel">
        <h3>Category Rules</h3>
        <form className="rule-form" onSubmit={handleRuleSubmit}>
          <input
            type="text"
            placeholder="Keyword"
            value={ruleForm.keyword}
            onChange={(e) => setRuleForm((prev) => ({ ...prev, keyword: e.target.value }))}
            disabled={loading}
          />
          <select
            value={ruleForm.category}
            onChange={(e) => setRuleForm((prev) => ({ ...prev, category: e.target.value }))}
            disabled={loading}
          >
            <option value="">Select category</option>
            {categories.map((cat) => (
              <option key={cat.name} value={cat.name}>
                {cat.name}
              </option>
            ))}
          </select>
          <button type="submit" disabled={loading}>
            {loading ? "Saving..." : "Add Rule"}
          </button>
        </form>
        {loading ? (
          <Loader />
        ) : (
          <ul className="rule-list">
            {rules.map((rule) => (
              <li key={rule.id || rule.keyword}>
                <strong>{rule.keyword}</strong> → {rule.category}
              </li>
            ))}
            {!rules.length && (
              <li>
                <EmptyState title="No rules yet" message="Rules appear after you add them or approve reviews." />
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
};

export default Categories;
