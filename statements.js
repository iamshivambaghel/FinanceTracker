/*
 * Credit-card statement import: PDF -> text -> transactions -> buckets.
 *
 * PDF parsing is best-effort: bank layouts vary, so every parsed row is shown
 * to you for review/edit before anything is saved. Password-protected PDFs
 * are prompted for the password.
 *
 * Also handles pasted statement text (same line parser), which is the most
 * reliable path for any bank.
 */

/* ---- category buckets ---- */
const DEFAULT_BUCKET_RULES = [
  { category: "Groceries",     keywords: ["bigbasket", "blinkit", "zepto", "grofers", "dmart", "instamart", "grocery", "supermarket"] },
  { category: "Food & Dining", keywords: ["swiggy", "zomato", "restaurant", "cafe", "dominos", "mcdonald", "starbucks", "bakery", "pizza", "kfc", "eatery"] },
  { category: "Shopping",      keywords: ["amazon", "flipkart", "myntra", "ajio", "h&m", "hnm", "zara", "adidas", "nike", "puma", "lifestyle", "shoppers", "reliance trends", "mall", "decathlon", "westside", "bag", "apparel"] },
  { category: "Travel",        keywords: ["uber", "ola", "rapido", "indigo", "vistara", "spicejet", "air india", "irctc", "flight", "makemytrip", "goibibo", "oyo", "hotel", "railway"] },
  { category: "Fuel",          keywords: ["petrol", "fuel", "hpcl", "iocl", "bpcl", "indian oil", "shell", "gas station"] },
  { category: "Bills & Utilities", keywords: ["electricity", "water bill", "broadband", "jio", "airtel", "vodafone", " vi ", "recharge", "dth", "wifi", "postpaid", "utility"] },
  { category: "Entertainment", keywords: ["netflix", "spotify", "prime video", "hotstar", "bookmyshow", "movie", "pvr", "inox", "youtube premium"] },
  { category: "Health",        keywords: ["pharmacy", "apollo", "hospital", "clinic", "medical", "skin", "dermat", "medplus", "1mg", "pharmeasy"] },
  { category: "Insurance",     keywords: ["insurance", "policy", "lic", "premium"] },
  { category: "Loan / EMI",    keywords: ["emi", "loan", "installment", "instalment"] },
  { category: "Family / Transfer", keywords: ["upi", "imps", "neft", "transfer", "sent to", "p2p"] },
];

function categorize(description, rules) {
  const d = " " + (description || "").toLowerCase() + " ";
  for (const r of (rules || DEFAULT_BUCKET_RULES)) {
    if (r.keywords.some(k => d.includes(k.toLowerCase()))) return r.category;
  }
  return "Other";
}

/* ---- PDF text extraction (dynamic import so local file:// use still works) ---- */
async function extractPdfText(file, password) {
  const pdfjs = await import("https://esm.sh/pdfjs-dist@4.7.76/build/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "https://esm.sh/pdfjs-dist@4.7.76/build/pdf.worker.min.mjs";
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf, password: password || undefined }).promise;
  let lines = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // Group text items into visual lines by their y-position.
    const rows = {};
    content.items.forEach(it => {
      const y = Math.round(it.transform[5]);
      (rows[y] = rows[y] || []).push({ x: it.transform[4], s: it.str });
    });
    Object.keys(rows).map(Number).sort((a, b) => b - a).forEach(y => {
      const line = rows[y].sort((a, b) => a.x - b.x).map(o => o.s).join(" ").replace(/\s+/g, " ").trim();
      if (line) lines.push(line);
    });
  }
  return lines.join("\n");
}

/* ---- line parser: find date + amount rows ---- */
const DATE_RE = /\b(\d{1,2}[-/ ](?:\d{1,2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[-/ ]\d{2,4})\b/i;
const AMOUNT_RE = /(?:(?:rs\.?|inr|₹)\s*)?([\d,]+\.\d{2})\s*(cr|dr)?\.?\s*$/i;

function parseStatementText(text, rules) {
  const out = [];
  const seen = new Set();
  text.split(/\r?\n/).forEach(raw => {
    const line = raw.trim();
    if (!line) return;
    const dateM = line.match(DATE_RE);
    const amtM = line.match(AMOUNT_RE);
    if (!dateM || !amtM) return;
    const amount = parseFloat(amtM[1].replace(/,/g, ""));
    if (!amount || isNaN(amount)) return;

    // description = line minus date minus trailing amount
    let desc = line.replace(dateM[0], "").replace(amtM[0], "").replace(/\s+/g, " ").trim();
    desc = desc.replace(/^[-–|:]+/, "").replace(/[-–|:]+$/, "").trim() || "Transaction";

    // Cr = credit/refund; Dr or none = debit
    const isCredit = /cr/i.test(amtM[2] || "") || /\b(credit|refund|reversal|payment received|cashback)\b/i.test(line);
    const key = dateM[1] + "|" + amount + "|" + desc.slice(0, 24).toLowerCase();
    if (seen.has(key)) return; // de-dupe within the statement
    seen.add(key);

    out.push({
      date: dateM[1],
      description: desc,
      amount,
      direction: isCredit ? "credit" : "debit",
      category: categorize(desc, rules),
    });
  });
  return out;
}

/* ---- verification against existing data + a stated total ---- */
function verifyImport(parsed, existingTxns, statedTotal) {
  const debitSum = parsed.filter(t => t.direction === "debit").reduce((s, t) => s + t.amount, 0);
  const creditSum = parsed.filter(t => t.direction === "credit").reduce((s, t) => s + t.amount, 0);
  const existKeys = new Set((existingTxns || []).map(t =>
    (t.date || "") + "|" + Math.abs(t.amount) + "|" + (t.merchant || t.description || "").slice(0, 24).toLowerCase()));
  const duplicates = parsed.filter(t =>
    existKeys.has(t.date + "|" + t.amount + "|" + t.description.slice(0, 24).toLowerCase())).length;

  const net = debitSum - creditSum;
  let reconciles = null, diff = null;
  if (statedTotal != null && !isNaN(statedTotal) && statedTotal > 0) {
    diff = Math.round((debitSum - statedTotal) * 100) / 100;
    reconciles = Math.abs(diff) < 1; // within ₹1 rounding
  }
  return { count: parsed.length, debitSum, creditSum, net, duplicates, reconciles, diff };
}

if (typeof module !== "undefined") {
  module.exports = { DEFAULT_BUCKET_RULES, categorize, extractPdfText, parseStatementText, verifyImport };
}
