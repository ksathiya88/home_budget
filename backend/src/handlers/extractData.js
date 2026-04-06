/**
 * Parse OCR text into structured items.
 * @param {string} text
 * @returns {{ items: { name: string; price: number }[] }}
 */
function extractData(text) {
  console.log("Input text:", text);

  const items = [];

  if (!text || typeof text !== "string") {
    console.log("Extracted items:", items);
    return { items };
  }

  const lines = text.split(/\r?\n/);
  let pendingName = null;
  let stop = false;

  for (const rawLine of lines) {
    let line = (rawLine || "").trim();
    if (!line) continue;
    if (/^total\b/i.test(line)) {
      stop = true;
      continue;
    }
    if (stop) continue;
    if (line === "*") continue;
    if (/^cash\b/i.test(line)) continue;
    if (/^change\b/i.test(line)) continue;
    if (/^join\b/i.test(line)) continue;

    // Strip currency symbols for parsing
    line = line.replace(/[£$€]/g, "").trim();

    const nums = [...line.matchAll(/-?\d+(?:\.\d+)?/g)];
    if (!nums.length) {
      // keep as potential name for following price-only line
      pendingName = line;
      continue;
    }

    const priceStr = nums[nums.length - 1][0];
    const price = Number(priceStr);
    if (!Number.isFinite(price)) continue;

    // Remove only the last number occurrence from the line to keep the name.
    let name = line.replace(new RegExp(priceStr + "\\s*$"), "").trim().replace(/\s{2,}/g, " ");

    if (!name) {
      // If name missing, use pending previous text line if available
      if (pendingName) {
        name = pendingName;
        pendingName = null;
      } else {
        continue;
      }
    } else {
      pendingName = null;
    }

    items.push({ name, price });
  }

  console.log("Extracted items:", items);
  return { items };
}

module.exports = { extractData };
