type AiResult = { category: string; confidence: number };

const keywordMap: Record<string, string> = {
  coffee: "Food",
  latte: "Food",
  grocery: "Groceries",
  market: "Groceries",
  uber: "Transport",
  lyft: "Transport",
  fuel: "Transport",
  rent: "Housing",
  netflix: "Entertainment",
  movie: "Entertainment"
};

export const aiCategorise = (itemName: string): AiResult => {
  const normalized = itemName.toLowerCase();
  for (const [keyword, category] of Object.entries(keywordMap)) {
    if (normalized.includes(keyword)) {
      return { category, confidence: 0.85 };
    }
  }
  return { category: "Uncategorized", confidence: 0.5 };
};
