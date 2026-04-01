import { CategoryRule } from "./firestore";

const normalize = (text: string) => text.trim().toLowerCase();

export const applyCategoryRules = (itemName: string, rules: CategoryRule[]): string | null => {
  const normalizedItem = normalize(itemName);
  const match = rules
    .map((rule) => ({
      ...rule,
      keyword: normalize(rule.keyword),
      category: rule.category?.trim()
    }))
    .filter(
      (rule) =>
        rule.keyword.length &&
        rule.category &&
        rule.category.length > 0 &&
        rule.category.toLowerCase() !== "uncategorized"
    )
    .find((rule) => normalizedItem.includes(rule.keyword));
  return match ? match.category : null;
};
