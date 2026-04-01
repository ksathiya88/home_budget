import React, { useEffect, useMemo, useState } from "react";
import "./Dashboard.css";
import { getBudgetSummary, BudgetSummaryItem } from "../../services/summary";
import { useHouseholdId } from "../../hooks/useHouseholdId";
import Loader from "../../components/Loader";
import EmptyState from "../../components/EmptyState";

const Dashboard: React.FC = () => {
  const householdId = useHouseholdId();
  const [weekly, setWeekly] = useState<BudgetSummaryItem[]>([]);
  const [monthly, setMonthly] = useState<BudgetSummaryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const weeklyTotal = useMemo(
    () => weekly.reduce((sum, item) => sum + item.spent, 0),
    [weekly]
  );
  const monthlyTotal = useMemo(
    () => monthly.reduce((sum, item) => sum + item.spent, 0),
    [monthly]
  );

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [weekData, monthData] = await Promise.all([
          getBudgetSummary({ householdId, period: "weekly" }),
          getBudgetSummary({ householdId, period: "monthly" })
        ]);
        setWeekly(weekData);
        setMonthly(monthData);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [householdId]);

  return (
    <div className="page">
      <h1>Dashboard</h1>
      <p className="muted">
        Weekly and monthly spend overview, grouped by category and compared to budgets.
      </p>

      {error && <div className="panel error">Error: {error}</div>}

      <div className="card-grid three">
        <div className="card">
          <strong>This Week</strong>
          {loading ? <Loader /> : <div className="stat-number">${weeklyTotal.toFixed(2)}</div>}
          <div className="subtle">Sum of expenses for current weekId.</div>
        </div>
        <div className="card">
          <strong>This Month</strong>
          {loading ? <Loader /> : <div className="stat-number">${monthlyTotal.toFixed(2)}</div>}
          <div className="subtle">Sum of expenses for current monthId.</div>
        </div>
        <div className="card">
          <strong>Categories Tracked</strong>
          {loading ? <Loader /> : <div className="stat-number">{weekly.length || monthly.length || 0}</div>}
          <div className="subtle">Unique categories with spend this period.</div>
        </div>
      </div>

      {loading ? (
        <div className="panel">
          <Loader />
        </div>
      ) : (
        <div className="page-grid two">
          <div className="panel">
            <h3>Weekly by Category</h3>
            <SummaryTable items={weekly} />
          </div>
          <div className="panel">
            <h3>Monthly by Category</h3>
            <SummaryTable items={monthly} />
          </div>
        </div>
      )}
    </div>
  );
};

type SummaryProps = { items: BudgetSummaryItem[] };

const SummaryTable: React.FC<SummaryProps> = ({ items }) => (
  <table className="table">
    <thead>
      <tr>
        <th>Category</th>
        <th>Spent</th>
        <th>Limit</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      {items.map((item) => {
        const status = item.budgetLimit === null ? "No budget" : item.over ? "Exceeded" : "Within";
        return (
          <tr key={`${item.period}-${item.category}`}>
            <td>{item.category}</td>
            <td>${item.spent.toFixed(2)}</td>
            <td>{item.budgetLimit !== null ? `$${item.budgetLimit.toFixed(2)}` : "—"}</td>
            <td>
              <span className={`status-chip ${item.over ? "chip-over" : "chip-ok"}`}>{status}</span>
            </td>
          </tr>
        );
      })}
      {!items.length && (
        <tr>
          <td colSpan={4}>
            <EmptyState title="No data yet." message="Spend will appear once expenses are recorded." />
          </td>
        </tr>
      )}
    </tbody>
  </table>
);

export default Dashboard;
