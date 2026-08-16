/* FinanceTracker — app engine. No build step. */

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
let state = null;
let pendingImport = null;       // rows awaiting review before import
let netExpanded = false;

/* ---------- boot ---------- */
async function boot() {
  const { mode, user } = await Store.boot();
  Store.onAuthChange(async (u) => { renderAuthGate(); if (u) await hydrate(); });
  if (mode === "cloud" && !user) { renderAuthGate(); return; }
  await hydrate();
}
async function hydrate() {
  const loaded = await Store.load();
  state = loaded || JSON.parse(JSON.stringify(SEED));
  if (!state.income) state.income = [];
  if (!state.transactions) state.transactions = [];
  if (!state.bucketRules) state.bucketRules = DEFAULT_BUCKET_RULES;
  if (!state.cards) state.cards = SEED.cards ? JSON.parse(JSON.stringify(SEED.cards)) : [];
  migrateToCalendar(state);
  const periodEl = document.getElementById("stmt-period");
  if (periodEl && !periodEl.value) periodEl.value = currentMonth();
  document.getElementById("auth-gate").style.display = "none";
  document.getElementById("app").style.display = "";
  renderAuthGate();
  render();
}
function persist() { if (state) Store.save(state); }

/* ---------- month math (calendar-aware) ---------- */
function currentMonth() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}
function addMonths(ym, n) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}
function monthDiff(a, b) { // whole months from a to b (b - a)
  const [ay, am] = a.split("-").map(Number), [by, bm] = b.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
}
function ymLabel(ym) {
  const [y, m] = ym.split("-").map(Number);
  return MONTH_NAMES[m - 1] + " " + String(y).slice(2);
}

/*
 * One-time migration from the old fixed-anchor model to an absolute-date model:
 *   EMI  -> stores endMonth (the month of its last payment)
 *   one-time -> stores month (the month it was incurred)
 * After this, anchorMonth is always the real current month, so everything
 * advances automatically as the calendar moves.
 */
function migrateToCalendar(st) {
  const oldAnchor = st.anchorMonth || currentMonth();
  (st.commitments || []).forEach(it => {
    if (it.kind === "emi" && it.endMonth == null) {
      const mr = it.monthsRemaining != null ? it.monthsRemaining : 1;
      it.endMonth = addMonths(oldAnchor, mr - 1);
    }
    if (it.kind === "onetime" && it.month == null) it.month = oldAnchor;
  });
  st.anchorMonth = currentMonth(); // re-anchor to today, every load
}

/* ---------- helpers ---------- */
const INR = n => "₹" + Math.round(n).toLocaleString("en-IN");
function monthLabel(offset) { return ymLabel(addMonths(state.anchorMonth, offset)); }
function uid() { return "t" + Date.now() + Math.floor(Math.random() * 1000); }

/* Payments left on an EMI, counted from the current month (inclusive). */
function emiRemaining(it) {
  return it.endMonth ? Math.max(monthDiff(state.anchorMonth, it.endMonth) + 1, 0) : 0;
}

/* commitments only (planned money out) */
function commitmentInMonth(item, m) {
  if (item.kind === "fixed") return item.amount;
  if (item.kind === "onetime") return addMonths(state.anchorMonth, m) === item.month ? item.amount : 0;
  if (item.kind === "emi") { const rem = emiRemaining(item); return m >= 0 && m < rem ? item.amount : 0; }
  return 0;
}
function monthCommitments(m) { return state.commitments.reduce((s, it) => s + commitmentInMonth(it, m), 0); }
function totalIncome() { return (state.income || []).reduce((s, i) => s + (Number(i.amount) || 0), 0); }

/* recorded spends (from statements / captures) for a given period */
function txnsForPeriod(period) {
  return (state.transactions || []).filter(t => (t.period || state.anchorMonth) === period);
}
function spendSum(period) {
  return txnsForPeriod(period).reduce((s, t) => s + (t.direction === "credit" ? -Math.abs(t.amount) : Math.abs(t.amount)), 0);
}
function outflowThisMonth() { return monthCommitments(0) + spendSum(state.anchorMonth); }

/* ---------- paid-this-month tracking ---------- */
function paidKey(id) { return id + "::" + state.anchorMonth; }
function isPaid(id) { return !!(state.paid && state.paid[paidKey(id)]); }
function togglePaid(id) {
  if (!state.paid) state.paid = {};
  const k = paidKey(id);
  if (state.paid[k]) delete state.paid[k]; else state.paid[k] = true;
  render();
}
/* commitments actually due this month (active + not one-time-in-past) */
function dueThisMonth() { return state.commitments.filter(it => commitmentInMonth(it, 0) > 0); }

/* ---------- render orchestrator ---------- */
function render() {
  renderSummary();
  renderNetDetail();
  renderCashflow();
  renderProjection();
  renderCategories();
  renderPayoff();
  renderBreakdown();
  renderCards();
  refreshCardSelect();
  renderTable();
  persist();
}

/* ---------- cards registry ---------- */
function renderCards() {
  const el = document.getElementById("cards-list");
  if (!el) return;
  el.innerHTML = (state.cards || []).map(c => `
    <div class="card-chip">
      <i class="dot" style="background:${c.color || "var(--accent)"}"></i>
      <span class="card-chip-name">${c.name}</span>
      <span class="card-chip-meta">${c.last4 ? "•••• " + c.last4 : c.network || ""}</span>
      <button class="del card-del" data-id="${c.id}">✕</button>
    </div>`).join("") || `<p class="hint">No cards yet — add one below.</p>`;
  el.querySelectorAll(".card-del").forEach(b => b.onclick = () => {
    state.cards = state.cards.filter(c => c.id !== b.dataset.id); render();
  });
}
function refreshCardSelect() {
  const sel = document.getElementById("stmt-card");
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = `<option value="">Auto-detect / choose…</option>` +
    (state.cards || []).map(c => `<option value="${c.id}">${c.name}${c.last4 ? " ••" + c.last4 : ""}</option>`).join("");
  if (cur) sel.value = cur;
}

/* ---------- auth ---------- */
function renderAuthGate() {
  const gate = document.getElementById("auth-gate");
  const badge = document.getElementById("account-badge");
  if (Store.mode !== "cloud") {
    if (badge) badge.innerHTML = `<span class="mode-pill">Local mode</span>`;
    gate.style.display = "none";
    return;
  }
  if (Store.user) {
    badge.innerHTML = `<span class="mode-pill cloud">☁ ${Store.user.email}</span> <button id="signout" class="btn-ghost">Sign out</button>`;
    document.getElementById("signout").onclick = async () => { await Store.signOut(); location.reload(); };
  } else {
    badge.innerHTML = "";
    document.getElementById("app").style.display = "none";
    gate.style.display = "";
  }
}

/* ---------- summary ---------- */
function renderSummary() {
  const income = totalIncome();
  const outflow = outflowThisMonth();
  const net = income - outflow;
  const hasIncome = income > 0;
  const rate = hasIncome ? (net / income) * 100 : null;
  const cards = [
    { label: "Monthly income", value: hasIncome ? INR(income) : "—",
      sub: hasIncome ? `${state.income.length} source(s)` : "add it below ↓" },
    { label: `Outflow this month (${monthLabel(0)})`, value: INR(outflow), sub: "commitments + recorded spends" },
    { label: "Net this month", value: (net >= 0 ? "+" : "−") + INR(Math.abs(net)),
      cls: net >= 0 ? "pos" : "neg", sub: `${netExpanded ? "▾ hide" : "▸ show"} breakdown`, expandable: true },
    { label: "Savings rate", value: hasIncome ? rate.toFixed(0) + "%" : "—",
      cls: !hasIncome ? "" : rate >= 0 ? "pos" : "neg", sub: hasIncome ? "of income kept" : "needs income" },
  ];
  document.getElementById("summary").innerHTML = cards.map((c, i) => `
    <div class="card ${i === 2 ? "card-hero" : ""} ${c.cls || ""} ${c.expandable ? "expandable" : ""}" ${c.expandable ? 'id="net-card"' : ""}>
      <div class="card-label">${c.label}</div>
      <div class="card-value">${c.value}</div>
      ${c.sub ? `<div class="card-sub">${c.sub}</div>` : ""}
    </div>`).join("");
  const nc = document.getElementById("net-card");
  if (nc) nc.onclick = () => { netExpanded = !netExpanded; renderSummary(); renderNetDetail(); };
}
function renderNetDetail() {
  const el = document.getElementById("net-detail");
  if (!netExpanded) { el.style.display = "none"; el.innerHTML = ""; return; }
  const income = totalIncome();
  const items = state.commitments;
  const fixed = items.filter(i => i.kind === "fixed").reduce((s, i) => s + i.amount, 0);
  const emi = items.filter(i => i.kind === "emi").reduce((s, i) => s + commitmentInMonth(i, 0), 0);
  const oneTime = items.filter(i => i.kind === "onetime").reduce((s, i) => s + commitmentInMonth(i, 0), 0);
  const spends = spendSum(state.anchorMonth);
  const net = income - (fixed + emi + oneTime + spends);
  const row = (label, val, sign) => `
    <div class="nd-row"><span>${label}</span><span class="num ${sign > 0 ? "pos" : sign < 0 ? "neg" : ""}">${sign > 0 ? "+" : sign < 0 ? "−" : ""}${INR(Math.abs(val))}</span></div>`;
  el.innerHTML = `
    ${row("Income", income, 1)}
    ${row("Fixed monthly", fixed, -1)}
    ${row("EMIs this month", emi, -1)}
    ${row("One-time this month", oneTime, -1)}
    ${row("Recorded card spends", spends, -1)}
    <div class="nd-row nd-total"><span>Net this month</span><span class="num ${net >= 0 ? "pos" : "neg"}">${net >= 0 ? "+" : "−"}${INR(Math.abs(net))}</span></div>`;
  el.style.display = "";
}

/* ---------- income vs outflow ---------- */
function renderCashflow() {
  const income = totalIncome();
  const fixed = state.commitments.filter(i => i.kind === "fixed").reduce((s, i) => s + i.amount, 0);
  const emi = state.commitments.filter(i => i.kind === "emi").reduce((s, i) => s + commitmentInMonth(i, 0), 0);
  const oneTime = state.commitments.filter(i => i.kind === "onetime").reduce((s, i) => s + commitmentInMonth(i, 0), 0);
  const spends = Math.max(spendSum(state.anchorMonth), 0);
  const outflow = fixed + emi + oneTime + spends;
  const scale = Math.max(income, outflow, 1);
  const pct = v => (v / scale * 100).toFixed(1) + "%";
  const seg = (v, cls, lbl) => v > 0 ? `<div class="seg seg-${cls}" style="width:${pct(v)}" title="${lbl}: ${INR(v)}"></div>` : "";
  const bars = `
    <div class="cf-bar-row"><div class="cf-bar-label">Income</div>
      <div class="cf-bar"><div class="seg seg-income" style="width:${pct(income)}"></div></div>
      <div class="cf-bar-val num">${income > 0 ? INR(income) : "—"}</div></div>
    <div class="cf-bar-row"><div class="cf-bar-label">Outflow</div>
      <div class="cf-bar">${seg(fixed,"fixed","Fixed")}${seg(emi,"emi","EMIs")}${seg(oneTime,"one","One-time")}${seg(spends,"spend","Card spends")}</div>
      <div class="cf-bar-val num">${INR(outflow)}</div></div>
    <div class="cf-legend">
      <span><i class="dot seg-fixed"></i>Fixed ${INR(fixed)}</span>
      <span><i class="dot seg-emi"></i>EMIs ${INR(emi)}</span>
      <span><i class="dot seg-one"></i>One-time ${INR(oneTime)}</span>
      <span><i class="dot seg-spend"></i>Card spends ${INR(spends)}</span></div>`;
  const list = (state.income || []).map(inc => `
    <div class="inc-row"><span class="inc-name">${inc.name}</span>
      <span class="inc-amt num">${INR(inc.amount)}</span>
      <button class="del inc-del" data-id="${inc.id}">✕</button></div>`).join("")
    || `<p class="hint">No income added yet — add your take-home pay to unlock the savings rate.</p>`;
  document.getElementById("cashflow").innerHTML = `${bars}
    <div class="inc-editor"><div class="inc-list">${list}</div>
      <form id="income-form" class="inc-form">
        <input name="name" type="text" placeholder="Income source (e.g. Salary)" required>
        <input name="amount" type="number" placeholder="Amount ₹" required>
        <button type="submit" class="btn-primary">Add income</button>
      </form></div>`;
  document.getElementById("income-form").addEventListener("submit", e => {
    e.preventDefault();
    const f = e.target;
    state.income.push({ id: uid(), name: f.name.value.trim() || "Income", amount: parseFloat(f.amount.value) || 0 });
    render();
  });
  document.querySelectorAll(".inc-del").forEach(btn => {
    btn.onclick = () => { state.income = state.income.filter(i => i.id !== btn.dataset.id); render(); };
  });
}

/* ---------- 12-month forecast ---------- */
function renderProjection() {
  const months = 12;
  const data = Array.from({ length: months }, (_, m) => ({
    label: monthLabel(m),
    value: monthCommitments(m) + (m === 0 ? Math.max(spendSum(state.anchorMonth), 0) : 0),
  }));
  const income = totalIncome();
  const max = Math.max(...data.map(d => d.value), income, 1);
  const W = 760, H = 240, padL = 8, padB = 34, padT = 12;
  const bw = (W - padL) / months, barW = bw * 0.6, plotH = H - padB - padT;
  const bars = data.map((d, i) => {
    const h = (d.value / max) * plotH;
    const x = padL + i * bw + (bw - barW) / 2, y = H - padB - h, isNow = i === 0;
    const over = income > 0 && d.value > income;
    return `<g><rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="3" fill="${over ? "var(--danger)" : isNow ? "var(--accent)" : "var(--bar)"}"></rect>
      <text x="${x + barW / 2}" y="${y - 5}" class="bar-val">${(d.value/1000).toFixed(0)}k</text>
      <text x="${x + barW / 2}" y="${H - padB + 16}" class="bar-lbl ${isNow ? "now" : ""}">${d.label}</text></g>`;
  }).join("");
  let incomeLine = "";
  if (income > 0) {
    const y = H - padB - (income / max) * plotH;
    incomeLine = `<line x1="${padL}" y1="${y}" x2="${W}" y2="${y}" stroke="var(--credit)" stroke-width="1.5" stroke-dasharray="5 4"></line>
      <text x="${W - 4}" y="${y - 5}" class="bar-val" text-anchor="end" fill="var(--credit)">income ${(income/1000).toFixed(0)}k</text>`;
  }
  document.getElementById("projection").innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet">${bars}${incomeLine}</svg>
     <p class="hint">Bars show planned outflow (commitments); the current month also includes recorded card spends. ${income > 0 ? "Green line = income; red bars exceed it." : "Add income to see it here."}</p>`;
}

/* ---------- category breakdown ---------- */
const CAT_COLORS = ["#4f8cff","#7c5cff","#f0883e","#3fb950","#e3b341","#f85149","#56d1c9","#d16ba5","#a9c96f","#8b98a9"];
function renderCategories() {
  const cats = {};
  // planned commitments this month, by their category
  state.commitments.forEach(it => {
    const v = commitmentInMonth(it, 0);
    if (v > 0) cats[it.category] = (cats[it.category] || 0) + v;
  });
  // recorded spends this period, by bucket
  txnsForPeriod(state.anchorMonth).forEach(t => {
    if (t.direction === "credit") return;
    cats[t.category || "Other"] = (cats[t.category || "Other"] || 0) + Math.abs(t.amount);
  });
  const rows = Object.entries(cats).sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((s, r) => s + r[1], 0) || 1;
  document.getElementById("categories").innerHTML = rows.length ? rows.map(([cat, val], i) => `
    <div class="bd-row">
      <div class="bd-name"><i class="dot" style="background:${CAT_COLORS[i % CAT_COLORS.length]}"></i>${cat}</div>
      <div class="bd-track"><div class="bd-fill" style="width:${(val/rows[0][1]*100).toFixed(1)}%;background:${CAT_COLORS[i % CAT_COLORS.length]}"></div></div>
      <div class="bd-val num">${INR(val)} <span class="pctval">${(val/total*100).toFixed(0)}%</span></div>
    </div>`).join("") : `<p class="hint">No categorised spending yet.</p>`;
}

/* ---------- EMI payoff timeline ---------- */
function renderPayoff() {
  const emis = state.commitments.filter(i => i.kind === "emi" && emiRemaining(i) > 0)
    .map(i => { const rem = emiRemaining(i); return { ...i, rem, remainingTotal: i.amount * rem }; })
    .sort((a, b) => a.rem - b.rem);
  const totalRemaining = emis.reduce((s, e) => s + e.remainingTotal, 0);
  const monthlyEmi = emis.reduce((s, e) => s + e.amount, 0);
  const horizon = Math.max(...emis.map(e => e.rem), 1);
  const rows = emis.map(e => {
    const widthPct = (e.rem / horizon * 100).toFixed(1);
    return `
      <div class="pay-row">
        <div class="pay-name">${e.name}<span class="pay-src">${e.source}</span></div>
        <div class="pay-track">
          <div class="pay-bar" style="width:${widthPct}%">
            <span class="pay-bar-lbl">${INR(e.amount)}/mo</span>
          </div>
          <span class="pay-end">ends ${ymLabel(e.endMonth)}</span>
        </div>
        <div class="pay-total num">${INR(e.remainingTotal)}<span class="pay-sub">${e.rem} left</span></div>
      </div>`;
  }).join("");
  document.getElementById("payoff").innerHTML = `
    <div class="pay-summary">
      <div><div class="card-label">EMI debt remaining</div><div class="pay-big num">${INR(totalRemaining)}</div></div>
      <div><div class="card-label">EMI load per month</div><div class="pay-big num">${INR(monthlyEmi)}</div></div>
      <div><div class="card-label">Debt-free from</div><div class="pay-big">${emis.length ? monthLabel(horizon) : "—"}</div></div>
    </div>
    <div class="pay-list">${rows || '<p class="hint">No active EMIs 🎉</p>'}</div>
    <p class="hint">Each bar runs from this month to that EMI's final payment. Shortest-remaining first.</p>`;
}

/* ---------- by card ---------- */
function renderBreakdown() {
  const bySource = {};
  state.commitments.forEach(it => { const v = commitmentInMonth(it, 0); if (v) bySource[it.source] = (bySource[it.source] || 0) + v; });
  txnsForPeriod(state.anchorMonth).forEach(t => { if (t.direction === "credit") return; const s = t.source || "Card spends"; bySource[s] = (bySource[s] || 0) + Math.abs(t.amount); });
  const rows = Object.entries(bySource).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...rows.map(r => r[1]), 1);
  document.getElementById("breakdown").innerHTML = rows.map(([src, val]) => `
    <div class="bd-row"><div class="bd-name">${src}</div>
      <div class="bd-track"><div class="bd-fill" style="width:${(val/max*100).toFixed(1)}%"></div></div>
      <div class="bd-val num">${INR(val)}</div></div>`).join("");
}

/* ---------- table ---------- */
function renderTable() {
  const kindLabel = { emi: "EMI", fixed: "Fixed", onetime: "One-time" };
  const kindOrder = { emi: 0, fixed: 1, onetime: 2 };
  const commit = [...state.commitments].sort((a, b) =>
    (kindOrder[a.kind] - kindOrder[b.kind]) || (commitmentInMonth(b, 0) - commitmentInMonth(a, 0)));
  const commitRows = commit.map(it => {
    const activeNow = commitmentInMonth(it, 0) > 0;
    let sched;
    if (it.kind === "emi") {
      const rem = emiRemaining(it);
      sched = rem > 0 ? `${rem} left · ends ${ymLabel(it.endMonth)}` : `closed ${ymLabel(it.endMonth)}`;
    } else if (it.kind === "fixed") {
      sched = "every month";
    } else {
      sched = `one-time · ${ymLabel(it.month)}`;
    }
    const paid = activeNow && isPaid(it.id);
    const check = activeNow
      ? `<input type="checkbox" class="paid-box" data-id="${it.id}" ${paid ? "checked" : ""} title="Mark paid for ${monthLabel(0)}">`
      : "";
    return `<tr class="${activeNow ? "" : "row-dim"} ${paid ? "row-paid" : ""}">
      <td>${it.name}</td><td>${it.source}</td>
      <td><span class="pill pill-${it.kind}">${kindLabel[it.kind]}</span></td>
      <td class="num">${INR(it.amount)}</td><td class="sched">${sched}</td>
      <td class="paid-cell">${check}</td></tr>`;
  }).join("");
  const txns = (state.transactions || []).slice().reverse();
  const txnRows = txns.map(t => {
    const credit = t.direction === "credit";
    return `<tr>
      <td>${t.merchant || t.description || "Transaction"} <span class="tag">${t.category || "spend"}</span></td>
      <td>${t.source || "—"}</td>
      <td><span class="pill pill-spend">Spend · ${t.period || state.anchorMonth}</span></td>
      <td class="num ${credit ? "credit" : ""}">${credit ? "+" : ""}${INR(Math.abs(t.amount))}</td>
      <td class="sched">${t.date || ""}</td>
      <td><button class="del" data-id="${t.id}">✕</button></td></tr>`;
  }).join("");
  document.getElementById("table-body").innerHTML = commitRows + txnRows;
  document.querySelectorAll("#table-body .del").forEach(btn => {
    btn.onclick = () => { state.transactions = state.transactions.filter(t => t.id !== btn.dataset.id); render(); };
  });
  document.querySelectorAll("#table-body .paid-box").forEach(box => {
    box.onchange = () => togglePaid(box.dataset.id);
  });

  // dues progress caption
  const due = dueThisMonth();
  const total = due.reduce((s, it) => s + it.amount, 0);
  const paidAmt = due.filter(it => isPaid(it.id)).reduce((s, it) => s + it.amount, 0);
  const cap = document.getElementById("dues-progress");
  if (cap) {
    const left = total - paidAmt;
    cap.innerHTML = `<b>${monthLabel(0)}:</b> paid ${INR(paidAmt)} of ${INR(total)} `
      + `· <span class="${left > 0 ? "warn-inline" : "ok-inline"}">${left > 0 ? INR(left) + " still to pay" : "all cleared ✓"}</span>`;
  }
}

/* ---------- statement import ---------- */
async function handleStatementFile() {
  const fileInput = document.getElementById("stmt-file");
  const status = document.getElementById("import-status");
  const file = fileInput.files[0];
  if (!file) { status.textContent = "Choose a PDF first."; return; }
  status.textContent = "Reading PDF…";
  try {
    let text;
    try {
      text = await extractPdfText(file);
    } catch (e) {
      if (/password/i.test(e.message || "")) {
        const pw = prompt("This PDF is password-protected. Enter its password:");
        text = await extractPdfText(file, pw);
      } else throw e;
    }
    applyCardDetection(text);
    finishParse(parseStatementText(text, state.bucketRules));
  } catch (e) {
    status.textContent = "Couldn't read that PDF (" + (e.message || e) + "). Try the paste-text box instead.";
  }
}
function handleStatementText() {
  const text = document.getElementById("stmt-text").value;
  if (!text.trim()) { document.getElementById("import-status").textContent = "Paste some statement lines first."; return; }
  applyCardDetection(text);
  finishParse(parseStatementText(text, state.bucketRules));
}
/* Auto-pick the matching card and show what was detected. */
function applyCardDetection(text) {
  const note = document.getElementById("card-detected");
  const sel = document.getElementById("stmt-card");
  const match = detectCardFromText(text, state.cards);
  if (match) {
    sel.value = match.id;
    if (note) note.innerHTML = `✓ detected <b>${match.name}</b>${match.last4 ? " ••" + match.last4 : ""}`;
  } else if (note) {
    note.textContent = "couldn't auto-detect — pick the card above";
  }
}
function finishParse(rows) {
  const status = document.getElementById("import-status");
  if (!rows.length) { status.textContent = "No transactions found. The layout may be unusual — try pasting the transaction lines."; return; }
  pendingImport = rows;
  status.textContent = "";
  renderImportReview();
}
function renderImportReview() {
  const el = document.getElementById("import-review");
  if (!pendingImport) { el.innerHTML = ""; return; }
  const statedTotal = parseFloat(document.getElementById("stmt-total").value) || null;
  const v = verifyImport(pendingImport, state.transactions, statedTotal);
  const catOptions = [...state.bucketRules.map(r => r.category), "Other"];
  const rows = pendingImport.map((t, i) => `
    <tr>
      <td>${t.date}</td>
      <td><input value="${(t.description||"").replace(/"/g,'&quot;')}" data-i="${i}" data-k="description"></td>
      <td><select data-i="${i}" data-k="direction">
        <option value="debit" ${t.direction==="debit"?"selected":""}>Debit</option>
        <option value="credit" ${t.direction==="credit"?"selected":""}>Credit</option></select></td>
      <td><input type="number" value="${t.amount}" data-i="${i}" data-k="amount" class="num-in"></td>
      <td><select data-i="${i}" data-k="category">${catOptions.map(c => `<option ${t.category===c?"selected":""}>${c}</option>`).join("")}</select></td>
      <td><button class="del" data-drop="${i}">✕</button></td>
    </tr>`).join("");
  const recon = v.reconciles === null ? `<span class="mut">no total entered</span>`
    : v.reconciles ? `<span class="ok-inline">✓ reconciles</span>`
    : `<span class="warn-inline">✕ off by ${INR(Math.abs(v.diff))}</span>`;
  el.innerHTML = `
    <div class="verify-bar">
      <span><b>${v.count}</b> rows</span>
      <span>Debits <b>${INR(v.debitSum)}</b></span>
      <span>Credits <b>${INR(v.creditSum)}</b></span>
      <span>vs stated total: ${recon}</span>
      ${v.duplicates ? `<span class="warn-inline">${v.duplicates} possible duplicate(s)</span>` : ""}
    </div>
    <div class="table-wrap"><table class="import-table">
      <thead><tr><th>Date</th><th>Description</th><th>Dir</th><th>Amount</th><th>Bucket</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    <button id="confirm-import" class="btn-primary">Import ${v.count} transaction(s)</button>
    <button id="cancel-import" class="btn-ghost">Cancel</button>`;

  el.querySelectorAll("input,select").forEach(inp => {
    inp.oninput = () => {
      const i = +inp.dataset.i, k = inp.dataset.k;
      pendingImport[i][k] = k === "amount" ? parseFloat(inp.value) || 0 : inp.value;
      if (k === "direction" || k === "amount") renderImportReview();
    };
  });
  el.querySelectorAll("[data-drop]").forEach(b => b.onclick = () => { pendingImport.splice(+b.dataset.drop, 1); renderImportReview(); });
  document.getElementById("cancel-import").onclick = () => { pendingImport = null; renderImportReview(); };
  document.getElementById("confirm-import").onclick = () => {
    const period = document.getElementById("stmt-period").value || state.anchorMonth;
    const cardId = document.getElementById("stmt-card").value;
    const card = (state.cards || []).find(c => c.id === cardId);
    const source = card ? card.name : "Card statement";
    pendingImport.forEach(t => state.transactions.push({
      id: uid(), date: t.date, merchant: t.description, description: t.description,
      amount: Math.abs(t.amount), direction: t.direction, category: t.category, source, period,
    }));
    pendingImport = null;
    document.getElementById("stmt-text").value = "";
    document.getElementById("stmt-file").value = "";
    document.getElementById("import-status").textContent = "Imported ✓";
    render();
  };
}

/* ---------- manual add ---------- */
function handleManualAdd(e) {
  e.preventDefault();
  const f = e.target;
  const item = { id: uid(), name: f.name.value.trim() || "Untitled", source: f.source.value.trim() || "Manual",
    category: f.category.value.trim() || "Other", kind: f.kind.value, amount: parseFloat(f.amount.value) || 0 };
  if (item.kind === "emi") {
    const months = parseInt(f.months.value) || 1;
    item.endMonth = addMonths(state.anchorMonth, months - 1); // last payment month
  }
  if (item.kind === "onetime") item.month = state.anchorMonth;
  state.commitments.push(item); f.reset();
  document.getElementById("months-wrap").style.display = "none";
  render();
}

/* ---------- backup ---------- */
function exportBackup() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "financetracker-backup-" + new Date().toISOString().slice(0, 10) + ".json";
  a.click();
}
function importBackup(e) {
  const file = e.target.files[0]; if (!file) return;
  const r = new FileReader();
  r.onload = () => { try { state = JSON.parse(r.result); render(); } catch (err) { alert("Not a valid backup file."); } };
  r.readAsText(file);
}

/* ---------- wire up ---------- */
function wireStatic() {
  document.getElementById("stmt-parse-file").onclick = handleStatementFile;
  document.getElementById("stmt-parse-text").onclick = handleStatementText;
  document.getElementById("stmt-total").oninput = () => { if (pendingImport) renderImportReview(); };
  document.getElementById("card-form").addEventListener("submit", e => {
    e.preventDefault();
    const f = e.target;
    const last4 = (f.last4.value.match(/\d/g) || []).join("").slice(-4);
    const palette = ["#4f8cff","#7c5cff","#f0883e","#3fb950","#e3b341","#f85149","#56d1c9","#d16ba5"];
    state.cards.push({
      id: "card-" + uid(), name: f.name.value.trim() || "Card",
      network: f.network.value.trim(), last4,
      color: palette[state.cards.length % palette.length],
    });
    f.reset(); render();
  });
  document.getElementById("manual-form").addEventListener("submit", handleManualAdd);
  document.querySelector('#manual-form select[name="kind"]').addEventListener("change", e => {
    document.getElementById("months-wrap").style.display = e.target.value === "emi" ? "block" : "none";
  });
  document.getElementById("months-wrap").style.display = "none";
  document.getElementById("export-btn").onclick = exportBackup;
  document.getElementById("import-file").addEventListener("change", importBackup);
  const savedTheme = localStorage.getItem("ft.theme");
  if (savedTheme) document.documentElement.setAttribute("data-theme", savedTheme);
  document.getElementById("theme-btn").onclick = () => {
    const root = document.documentElement;
    const cur = root.getAttribute("data-theme");
    const isDark = cur ? cur === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    const next = isDark ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem("ft.theme", next);
  };
  const creds = () => ({
    email: document.getElementById("login-email").value.trim(),
    password: document.getElementById("login-password").value,
    s: document.getElementById("login-status"),
  });
  document.getElementById("login-btn").onclick = async () => {
    const { email, password, s } = creds();
    if (!email || !password) { s.textContent = "Enter your email and password."; return; }
    s.textContent = "Signing in…";
    try { await Store.signInPassword(email, password); s.textContent = "Signed in ✓"; }
    catch (e) {
      const m = e.message || String(e);
      s.textContent = /not confirmed/i.test(m)
        ? "This account is still pending email confirmation. In Supabase, delete this user (Auth → Users) and turn OFF ‘Confirm email’, then Create account again."
        : /invalid/i.test(m) ? "Wrong email or password. (New here? Tap ‘Create account’.)"
        : "Error: " + m;
    }
  };
  document.getElementById("signup-btn").onclick = async () => {
    const { email, password, s } = creds();
    if (!email || !password) { s.textContent = "Enter an email and a password to create your account."; return; }
    if (password.length < 6) { s.textContent = "Use a password of at least 6 characters."; return; }
    s.textContent = "Creating account…";
    try {
      const { needsConfirm } = await Store.signUpPassword(email, password);
      s.textContent = needsConfirm
        ? "Account created, but ‘Confirm email’ is ON in Supabase. Turn it OFF (Auth → Sign In / Providers → Email), then tap Sign in."
        : "Account created ✓ — you're in.";
    } catch (e) {
      const msg = e.message || String(e);
      if (/already registered|already exists/i.test(msg)) {
        try { await Store.signInPassword(email, password); s.textContent = "Signed in ✓"; }
        catch (_) { s.textContent = "That email already has an account, but this password didn't match. Use your existing password."; }
      } else {
        s.textContent = "Error: " + msg;
      }
    }
  };
}

wireStatic();
boot();
