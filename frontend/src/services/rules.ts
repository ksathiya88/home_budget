import { CategoryRule } from "./firestore";

export const applyCategoryRules = (itemName: string, rules: CategoryRule[]): string | null => {
  const normalizedItem = itemName.toLowerCase();
  const match = rules.find((rule) => normalizedItem.includes(rule.keyword.toLowerCase()));
  return match ? match.category : null;
};
