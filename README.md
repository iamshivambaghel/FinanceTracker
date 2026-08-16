# FinanceTracker

A personal finance dashboard for your EMIs, loans, income, and card spending —
with **credit-card statement import** (PDF → verified, auto-bucketed
transactions) and optional **cloud sync across devices**. No build step; it's
plain HTML/CSS/JS, so it deploys to Vercel as a static site in one click.

## What it does

- **Savings account balance** — set your current bank balance; Cash/UPI spends
  and any dues you tick "paid" draw it down in real time, while **card spends
  don't** (those are paid later via the card's statement). Top it up with
  "Add money" when your salary lands. A baseline timestamp keeps it from
  double-counting anything logged before you set the balance.
- **Income, Net & Savings rate** — optional; add your income source(s) to see net cash flow
  and what % of income you keep. The **Net card is expandable** — tap it to see
  the full income-minus-outflow breakdown.
- **12-month forecast** — planned outflow per month; bars shrink as EMIs finish,
  with an income reference line (red bars = months you overspend).
- **Where your money goes** — spending grouped into categories (Shopping, Loans,
  Family, Travel, Food…), combining commitments and imported card spends.
- **EMI payoff timeline** — every active EMI as a bar running to its final
  payment, plus total EMI debt remaining and your debt-free date.
- **My cards** — register each card by its **last 4 digits only** (never the full
  number). Uploaded statements are then **auto-matched to the right card**, so
  imported transactions are routed automatically.
- **Statement import** — upload a card statement PDF (or paste its lines); the
  card is auto-detected, each transaction is auto-bucketed and shown for review,
  reconciled against the stated total, with duplicate detection — nothing saves
  until you confirm.
- **Quick add** — type a spend in plain language ("spent 1000 at petrol pump",
  "1.5k myntra on icici") and it extracts the amount, category and card, asks
  for the amount if it can't find one, and records it in one tap.
- **"This month" checklist** — a compact top view of everything due this month
  with paid checkboxes and a progress bar.
- **Month-end summary** — a collapsible recap for any month: income, total
  outflow, saved/overspent, savings rate, where the money went, biggest items,
  dues cleared, and a vs-previous-month delta, with a one-tap "copy text recap".
- **Monthly paid checkoff** — tick each EMI/fixed due as you actually pay it;
  a progress line shows "paid ₹X of ₹Y this month", and ticks reset every new
  month so it doubles as your monthly bill checklist.
- **Backup & restore** — export/import your whole dataset as JSON any time.

## Run it locally

Open **`index.html`** in a browser for the basic dashboard. For statement PDF
parsing and cloud sync (which load libraries over the network) serve it over
http instead of `file://`:

```bash
npx serve .        # then open the printed http://localhost:3000
```

## Deploy to Vercel (recommended — makes storage durable)

1. Push this repo to GitHub (already done on your branch).
2. In Vercel: **Add New → Project → import this repo**. No framework, no build
   command — it's static. Click **Deploy**.
3. Open your new URL. Data now persists across refreshes on your own domain.

That alone gives you a private, always-available tracker using this-browser
storage. To also sync across phone + laptop, add cloud mode below.

## Install it as an iPhone (or Android) app — free, no App Store

FinanceTracker is a **PWA**, so it installs to your home screen with its own
icon and runs full-screen like a native app:

**iPhone (Safari):** open your deployed URL → tap the **Share** button → **Add to
Home Screen** → **Add**. Launch it from the new icon — no Safari bars, works
offline, syncs when online.

**Android (Chrome):** open the URL → menu **⋮** → **Install app**.

### Login uses email + password (no email round-trip)
The app signs in with an **email and password** — nothing is emailed, so it works
instantly inside the installed home-screen app (where magic links fail, because
tapping the link opens Safari, not the app). One-time Supabase setting to make
this frictionless: **Authentication → Sign In / Providers → Email → turn OFF
"Confirm email"**. Then just tap **Create account** once, and sign in with those
credentials on every device.

### Want a real App Store build later?
The web app can be wrapped with [Capacitor](https://capacitorjs.com) into a
native iOS project, but building/signing it needs a **Mac with Xcode** and an
**Apple Developer account ($99/yr)** — it can't be produced on Linux/CI alone.
The PWA above gives you the same day-to-day experience without any of that.

## Cloud sync across devices (Supabase — free)

1. Create a free project at [supabase.com](https://supabase.com).
2. **SQL Editor → New query** → paste all of [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
3. **Project Settings → API** → copy the **Project URL** and the **anon public key**.
4. Paste both into [`config.js`](config.js):
   ```js
   window.FT_CONFIG = {
     SUPABASE_URL: "https://YOURPROJECT.supabase.co",
     SUPABASE_ANON_KEY: "eyJhbGc...your-anon-key...",
   };
   ```
5. In Supabase **Authentication → Sign In / Providers → Email**, turn **off
   "Confirm email"** (so you can sign in without any email step — ideal for the
   installed app).
6. Commit & redeploy. Tap **Create account** once with an email + password, and
   sign in with those on every device — your data syncs across all of them.

The anon key is designed to be public; Row Level Security (in the schema) means
each user can only ever touch their own row.

## About statement PDFs

Bank PDF layouts vary and some are password-protected (you'll be prompted for
the password). Parsing is therefore **best-effort with a mandatory review step**
— you see and can edit every parsed row, its bucket, and direction, and the
importer reconciles the debit total against the figure you enter before saving.
If a particular bank's PDF doesn't parse cleanly, paste its transaction lines
into the text box — that path works for any format.

Customise the category buckets by editing `DEFAULT_BUCKET_RULES` in
[`statements.js`](statements.js).

## Files

| File | Purpose |
|------|---------|
| `index.html` / `styles.css` | UI and theme (light + dark) |
| `config.js` | Supabase keys (blank = local mode) |
| `data.js` | Your seeded commitments & income |
| `parser.js` | Single bank-alert message → transaction |
| `statements.js` | PDF text extraction, statement parsing, buckets, verification |
| `store.js` | Persistence + auth (local / Supabase) |
| `app.js` | State, projections, rendering, import flow |
| `supabase/schema.sql` | Database table + Row Level Security |
| `vercel.json` | Static hosting config |
