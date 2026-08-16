/*
 * Transaction message parser.
 *
 * Paste a bank SMS / iMessage transaction alert and this pulls out:
 *   amount, direction (debit/credit), merchant, card/bank, last-4 digits.
 *
 * It is heuristic — tuned for Indian bank alert formats (ICICI, IDFC, SBI,
 * HDFC, Axis, Kotak, etc.). It returns a best-effort object; you confirm
 * before it is saved, so a wrong guess is easy to fix.
 */

const BANK_KEYWORDS = [
  { re: /icici/i,            source: "ICICI Credit Card" },
  { re: /idfc\s*first|first\s*select/i, source: "IDFC First Select Card" },
  { re: /idfc/i,            source: "IDFC Indigo Credit Card" },
  { re: /\bsbi\b|state bank/i, source: "SBI Credit Card" },
  { re: /hdfc/i,            source: "HDFC" },
  { re: /axis/i,            source: "Axis" },
  { re: /kotak/i,           source: "Kotak" },
];

function parseTxnMessage(text) {
  if (!text || !text.trim()) return null;
  const t = text.replace(/\s+/g, " ").trim();

  // --- amount: Rs / INR / ₹ followed by a number (with , and .) ---
  const amtMatch =
    t.match(/(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/i) ||
    t.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:rs\.?|inr|₹)/i);
  const amount = amtMatch ? parseFloat(amtMatch[1].replace(/,/g, "")) : null;

  // --- direction ---
  let direction = "debit";
  if (/\b(credit(ed)?|received|refund)\b/i.test(t) && !/credit card/i.test(t)) {
    direction = "credit";
  }
  if (/\b(spent|debit(ed)?|paid|purchase|used|withdrawn)\b/i.test(t)) {
    direction = "debit";
  }

  // --- merchant: "at X", "to X", "for X" up to a delimiter ---
  let merchant = null;
  const mMatch =
    t.match(/\bat\s+([A-Za-z0-9&.\- ]{2,40}?)(?:\s+on\b|\.\s|,|\bavl\b|\bavailable\b|$)/i) ||
    t.match(/\b(?:to|towards|for)\s+([A-Za-z0-9&.\- ]{2,40}?)(?:\s+on\b|\.\s|,|\bavl\b|$)/i);
  if (mMatch) merchant = mMatch[1].trim().replace(/\s+/g, " ");

  // --- card / bank + last 4 ---
  let source = "Unknown";
  for (const b of BANK_KEYWORDS) {
    if (b.re.test(t)) { source = b.source; break; }
  }
  const last4Match = t.match(/(?:x{2,}|ending|card no\.?|a\/c)\s*[xX*]*\s*(\d{4})/i) ||
                     t.match(/[xX*]{2,}(\d{4})/);
  const last4 = last4Match ? last4Match[1] : null;

  // --- date (optional) ---
  const dateMatch = t.match(/on\s+(\d{1,2}[-/][A-Za-z0-9]{2,3}[-/]\d{2,4})/i);

  return {
    amount,
    direction,
    merchant: merchant || (source !== "Unknown" ? source : "Transaction"),
    source,
    last4,
    dateText: dateMatch ? dateMatch[1] : null,
    raw: text.trim(),
    confident: amount != null,
  };
}

if (typeof module !== "undefined") module.exports = { parseTxnMessage };
