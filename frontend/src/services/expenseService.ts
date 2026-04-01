import {
  addExpense,
  addToReviewQueue,
  CategoryRule,
  ReviewQueueItem,
  Expense
} from "./firestore";
import { aiCategorise } from "./aiService";
import { applyCategoryRules } from "./rules";

export type ExpenseInput = {
  item: string;
  amount: number;
  category?: string;
  createdBy: string;
  createdByName: string;
  householdId: string;
  weekId: string;
  monthId: string;
  createdAt: number;
};

export type ProcessResult =
  | { status: "saved"; category: string; confidence: number; source: Expense["source"] }
  | { status: "queued"; suggestedCategory: string; confidence: number };

export const processExpense = async (input: ExpenseInput, rules: CategoryRule[]): Promise<ProcessResult> => {
  if (input.category) {
    await addExpense({
      ...input,
      category: input.category,
      confidence: 1,
      source: "manual",
      needsReview: false
    });
    // eslint-disable-next-line no-console
    console.info("[expense] manual category", { item: input.item, category: input.category });
    return { status: "saved", category: input.category, confidence: 1, source: "manual" };
  }

  const ruleCategory = applyCategoryRules(input.item, rules);
  if (ruleCategory) {
    await addExpense({
      ...input,
      category: ruleCategory,
      confidence: 1,
      source: "rule",
      needsReview: false
    });
    // eslint-disable-next-line no-console
    console.info("[expense] rule category", { item: input.item, category: ruleCategory });
    return { status: "saved", category: ruleCategory, confidence: 1, source: "rule" };
  }

  const aiResult = await aiCategorise(input.item, rules);
  if (aiResult.confidence >= 0.7) {
    await addExpense({
      ...input,
      category: aiResult.category,
      confidence: aiResult.confidence,
      source: "ai",
      needsReview: false
    });
    // eslint-disable-next-line no-console
    console.info("[expense] ai category", { item: input.item, result: aiResult });
    return { status: "saved", category: aiResult.category, confidence: aiResult.confidence, source: "ai" };
  }

  const queueItem: ReviewQueueItem = {
    item: input.item,
    amount: input.amount,
    suggestedCategory: aiResult.category,
    confidence: aiResult.confidence,
    householdId: input.householdId,
    createdBy: input.createdBy,
    createdByName: input.createdByName,
    weekId: input.weekId,
    monthId: input.monthId,
    createdAt: input.createdAt
  };
  await addToReviewQueue(queueItem);
  // eslint-disable-next-line no-console
  console.info("[expense] queued for review", { item: input.item, result: aiResult });
  return { status: "queued", suggestedCategory: aiResult.category, confidence: aiResult.confidence };
};
