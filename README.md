# FinanceTracker

A zero-dependency personal finance dashboard to track all your EMIs, loans,
fixed monthly expenses, and one-time purchases in one place — with a
**transaction-message parser** that turns a pasted bank SMS / iMessage alert
into a recorded expense.

## Open it

No build step, no server, no installs. Just open **`index.html`** in any
browser (double-click it, or drag it into a browser tab).

Your data is stored in the browser's `localStorage` — nothing leaves your
machine.

## What it shows

- **Income, Net & Savings rate** — add your monthly income source(s) and the
  dashboard shows your net cash flow (surplus/shortfall) and what % of income
  you keep. An income-vs-outflow bar breaks spending into fixed / EMI / one-time.
- **Due this month** — your total outflow for the current month.
- **12-month forecast** — a bar chart of what you'll pay each month; the bars
  shrink automatically as EMIs finish.
- **By card / source** — how much each card (ICICI, IDFC, SBI, HDFC…) and each
  fixed expense costs you this month.
- **Itemized table** — every commitment, its type, this-month amount, and when
  each EMI ends.

## Capturing transactions from a message

Paste a bank alert into the **"Capture a transaction from a message"** box, e.g.:

```
Rs 7000.00 spent on SBI Credit Card XX5678 at ADIDAS on 15-Aug-26.
```

The parser extracts the **amount, merchant, card, direction, and last-4**. You
confirm (and fix anything it got wrong), then it's added to the dashboard.

## Your seeded data

`data.js` is pre-loaded with your commitments (August 2026 anchor):

| Type | Items |
|------|-------|
| **EMIs** | ICICI AC (₹5k×6), ICICI health insurance (₹1.4k×3), IDFC car insurance (₹1.5k×10), IDFC flight (₹2k×6), HDFC skin care (₹6k×3) |
| **One-time this month** | ICICI H&M (₹5k), IDFC First Select final installment (₹13.7k), SBI bag/Adidas/H&M (₹9.5k) |
| **Fixed monthly** | Education loan (₹30k), car loan (₹10k), rent+cook (₹20k), NPS (₹5k), money home (₹20k) |

Edit `data.js` to change the starting values, or use the in-app "Reset data"
button to reload it.

## About automatic iMessage capture

Reading iMessage **automatically** requires a script running on your own Mac —
iMessages live in an encrypted local database (`~/Library/Messages/chat.db`)
that only your Apple device can read, with Full Disk Access granted. There is
no cloud API for it. A small companion script on your Mac could poll that
database for bank alerts and POST them into a hosted version of this app; the
in-app parser here is the same logic that would power it. For now, paste-to-capture
gives you the same result with two clicks and no security trade-offs.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Layout |
| `styles.css` | Dark dashboard theme |
| `data.js` | Your seeded commitments (edit here) |
| `parser.js` | Bank-message → structured transaction |
| `app.js` | State, projection engine, rendering |
