/*
 * Seed data for FinanceTracker.
 *
 * This is loaded ONCE on first run and copied into localStorage.
 * After that, edits you make in the app persist in the browser and this
 * file is no longer read (use "Reset to seed data" in Settings to reload it).
 *
 * anchorMonth = the month all EMI countdowns are measured from.
 * "monthsRemaining" is counted starting AT the anchor month (inclusive).
 */

const SEED = {
  anchorMonth: "2026-08", // August 2026 — "end of this month" payments

  // Every commitment is one object. kind drives the projection engine:
  //   "emi"     -> pays `amount` each month for `monthsRemaining` months (incl. anchor)
  //   "fixed"   -> pays `amount` every month, indefinitely
  //   "onetime" -> pays `amount` in the anchor month only
  commitments: [
    // ---- ICICI Credit Card ----
    { id: "icici-ac",        source: "ICICI Credit Card", name: "AC (air conditioner)",       category: "Shopping",  kind: "emi",     amount: 5000,  monthsRemaining: 6 },
    { id: "icici-health",    source: "ICICI Credit Card", name: "Health insurance",            category: "Insurance", kind: "emi",     amount: 1400,  monthsRemaining: 3 },
    { id: "icici-hnm",       source: "ICICI Credit Card", name: "H&M jeans + brown shirt",     category: "Shopping",  kind: "onetime", amount: 5000 },

    // ---- IDFC Indigo Credit Card ----
    { id: "idfc-car-ins",    source: "IDFC Indigo Credit Card", name: "Car insurance",         category: "Insurance", kind: "emi",     amount: 1500,  monthsRemaining: 10 },

    // ---- IDFC First Select Card ----
    { id: "idfc-select-last",source: "IDFC First Millenia Card", name: "Final installment (closing this month)", category: "EMI closeout", kind: "onetime", amount: 13700 },
    { id: "idfc-flight",     source: "IDFC First Millenia Card", name: "Flight",                  category: "Travel",    kind: "emi",     amount: 2000,  monthsRemaining: 6 },

    // ---- SBI Credit Card (one-time this month) ----
    { id: "sbi-bag",         source: "SBI Credit Card", name: "Bag",                            category: "Shopping",  kind: "onetime", amount: 7000 },
    { id: "sbi-adidas",      source: "SBI Credit Card", name: "Adidas",                         category: "Shopping",  kind: "onetime", amount: 1500 },
    { id: "sbi-hnm",         source: "SBI Credit Card", name: "H&M",                            category: "Shopping",  kind: "onetime", amount: 1000 },

    // ---- HDFC ----
    { id: "hdfc-skincare",   source: "HDFC", name: "Skin care",                                 category: "Personal",  kind: "emi",     amount: 6000,  monthsRemaining: 3 },

    // ---- Fixed monthly (indefinite) ----
    { id: "fix-edu-loan",    source: "Bank", name: "Education loan",                            category: "Loan",      kind: "fixed",   amount: 30000 },
    { id: "fix-car-loan",    source: "Bank", name: "Car loan",                                  category: "Loan",      kind: "fixed",   amount: 10000 },
    { id: "fix-rent",        source: "Household", name: "Home rent + cook etc.",                category: "Living",    kind: "fixed",   amount: 20000 },
    { id: "fix-nps",         source: "Investment", name: "NPS investment",                      category: "Savings",   kind: "fixed",   amount: 5000 },
    { id: "fix-home",        source: "Family", name: "Money sent home",                         category: "Family",    kind: "fixed",   amount: 20000 },
  ],

  // Registered cards — used to auto-route uploaded statements to the right card.
  // SECURITY: store the LAST 4 DIGITS ONLY, never the full card number. The
  // last 4 is what bank statements/SMS reference, and it's all matching needs.
  cards: [
    { id: "card-idfc-indigo",   name: "IDFC Indigo Credit Card",   network: "Mastercard", last4: "7173", color: "#4f8cff" },
    { id: "card-idfc-millenia", name: "IDFC First Millenia Card",  network: "Visa",       last4: "7875", color: "#7c5cff" },
    { id: "card-icici",         name: "ICICI Credit Card",         network: "Mastercard", last4: "5009", color: "#f0883e" },
    { id: "card-sbi",           name: "SBI Credit Card",           network: "Mastercard", last4: "9901", color: "#3fb950" },
    { id: "card-hdfc-savein",   name: "HDFC (SaveIN EMI)",         network: "EMI financing", last4: "",  color: "#e3b341" },
  ],

  // Monthly income sources. Add yours in the app (or here). Each pays every month.
  //   e.g. { id: "salary", name: "Salary (take-home)", amount: 200000 }
  income: [],

  // Ad-hoc transactions captured via the parser / manual add land here.
  transactions: [],
};

if (typeof module !== "undefined") module.exports = SEED;
