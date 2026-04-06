// Simple keyword-based categorisation for expenses.
// Returns { category, confidence }.

const keywordMap = new Map([
  ["milk", "Provisions"],
  ["rice", "Provisions"],
  ["bread", "Provisions"],
  ["banana", "Fruits"],
  ["apple", "Fruits"],
  ["chips", "Snacks"],
  ["nuts", "Snacks"],
  ["soap", "Household Items"],
  ["detergent", "Household Items"],
  ["bill", "Bills"],
  ["investment", "Investment"],
  ["toy", "Toys"]
]);

/**
 * Categorise an item name.
 * @param {string} itemName
 * @returns {Promise<{ category: string, confidence: number }>}
 */
async function categorizeItem(itemName) {
  const normalized = (itemName || "").trim().toLowerCase();
  for (const [keyword, category] of keywordMap.entries()) {
    if (normalized.includes(keyword)) {
      const res = { category, confidence: 0.9 };
      console.log("[categorize] hit", { itemName, category, confidence: res.confidence });
      return res;
    }
  }
  const fallback = { category: "Miscellaneous", confidence: 0.5 };
  console.log("[categorize] fallback", { itemName, ...fallback });
  return fallback;
}

module.exports = { categorizeItem };
