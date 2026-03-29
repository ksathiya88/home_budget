import { getBudgets, getExpenses } from "./firestore";

export type Period = "weekly" | "monthly";

export type BudgetSummaryItem = {
  category: string;
  spent: number;
  budgetLimit: number | null;
  remaining: number | null;
  over: boolean;
  period: Period;
  budgetId?: string;
};

type SummaryParams = {
  householdId: string;
  period: Period;
  weekId?: string;
  monthId?: string;
};

const getCurrentMonthId = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const getCurrentWeekId = () => {
  const now = new Date();
  // ISO week number computation
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

export const getBudgetSummary = async ({
  householdId,
  period,
  weekId,
  monthId
}: SummaryParams): Promise<BudgetSummaryItem[]> => {
  const [expenses, budgets] = await Promise.all([
    getExpenses(householdId),
    getBudgets(householdId)
  ]);

  const activeWeekId = weekId || getCurrentWeekId();
  const activeMonthId = monthId || getCurrentMonthId();

  const filteredExpenses = expenses.filter((exp) =>
    period === "weekly" ? exp.weekId === activeWeekId : exp.monthId === activeMonthId
  );

  const spendByCategory = filteredExpenses.reduce<Record<string, number>>((acc, exp) => {
    const key = exp.category || "uncategorized";
    acc[key] = (acc[key] || 0) + exp.amount;
    return acc;
  }, {});

  const periodBudgets = budgets.filter((b) => b.period === period);

  const results: BudgetSummaryItem[] = [];

  // Budgets first (ensures all budgeted categories appear)
  periodBudgets.forEach((budget) => {
    const categoryKey = budget.categoryId;
    const spent = spendByCategory[categoryKey] || 0;
    const remaining = budget.limit - spent;
    results.push({
      category: categoryKey,
      budgetId: budget.categoryId,
      spent,
      budgetLimit: budget.limit,
      remaining,
      over: remaining < 0,
      period
    });
    delete spendByCategory[categoryKey];
  });

  // Any spending without a budget
  Object.entries(spendByCategory).forEach(([category, spent]) => {
    results.push({
      category,
      spent,
      budgetLimit: null,
      remaining: null,
      over: false,
      period
    });
  });

  return results;
};
