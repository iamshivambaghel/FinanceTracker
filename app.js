/* FinanceTracker — app engine. No build step, no external libraries. */

const STORAGE_KEY = "financeTracker.v1";
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/* ---------- state ---------- */
function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try { return JSON.parse(saved); } catch (e) { /* fall through */ }
  }
  const fresh = JSON.parse(JSON.stringify(SEED));
  saveState(fresh);
  return fresh;
}
function saveState(s) { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }
let state = loadState();
if (!state.income) state.income = []; // migrate older saves

/* ---------- helpers ---------- */
const INR = n => "₹" + Math.round(n).toLocaleString("en-IN");
function monthLabel(offset) {
  const [y, m] = state.anchorMonth.split("-").map(Number);
  const d = new Date(y, m - 1 + offset, 1);
  return MONTH_NAMES[d.getMonth()] + " " + String(d.getFullYear()).slice(2);
}
function uid() { return "t" + Date.now() + Math.floor(Math.random() * 1000); }

/* All active commitments = seeded commitments + captured debit transactions
   (transactions are treated as one-time in the month they were added -> anchor). */
function allItems() {
  const txnItems = (state.transactions || []).map(tx => ({
    id: tx.id,
    source: tx.source || "Captured",
    name: tx.merchant || "Transaction",
    category: tx.category || "Captured",
    kind: "onetime",
    amount: tx.direction === "credit" ? -Math.abs(tx.amount) : Math.abs(tx.amount),
    _txn: true,
  }));
  return state.commitments.concat(txnItems);
}

/* Amount a single item contributes in month offset m (0 = anchor). */
function itemInMonth(item, m) {
  if (item.kind === "fixed") return item.amount;
  if (item.kind === "onetime") return m === 0 ? item.amount : 0;
  if (item.kind === "emi") return m < (item.monthsRemaining || 0) ? item.amount : 0;
  return 0;
}
function monthTotal(m) { return allItems().reduce((s, it) => s + itemInMonth(it, m), 0); }

function totalIncome() { return (state.income || []).reduce((s, i) => s + (Number(i.amount) || 0), 0); }
/* Steady recurring outflow = what repeats every month (fixed + active EMIs), excluding one-time spikes. */
function recurringOutflow() {
  return allItems().reduce((s, it) => s + (it.kind === "onetime" ? 0 : itemInMonth(it, 0)), 0);
}

/* ---------- rendering ---------- */
function render() {
  renderSummary();
  renderCashflow();
  renderProjection();
  renderBreakdown();
  renderTable();
  saveState(state);
}

function renderSummary() {
  const income = totalIncome();
  const outflow = monthTotal(0);
  const net = income - outflow;
  const hasIncome = income > 0;
  const savingsRate = hasIncome ? (net / income) * 100 : null;

  const cards = [
    { label: "Monthly income", value: hasIncome ? INR(income) : "—",
      sub: hasIncome ? `${(state.income || []).length} source(s)` : "add it below ↓" },
    { label: `Outflow this month (${monthLabel(0)})`, value: INR(outflow), sub: "all payments due" },
    { label: "Net this month", value: (net >= 0 ? "+" : "−") + INR(Math.abs(net)),
      cls: net >= 0 ? "pos" : "neg", sub: net >= 0 ? "surplus" : "shortfall" },
    { label: "Savings rate", value: hasIncome ? savingsRate.toFixed(0) + "%" : "—",
      cls: !hasIncome ? "" : savingsRate >= 0 ? "pos" : "neg",
      sub: hasIncome ? "of income kept this month" : "needs income" },
  ];
  document.getElementById("summary").innerHTML = cards.map((c, i) => `
    <div class="card ${i === 2 ? "card-hero" : ""} ${c.cls || ""}">
      <div class="card-label">${c.label}</div>
      <div class="card-value">${c.value}</div>
      ${c.sub ? `<div class="card-sub">${c.sub}</div>` : ""}
    </div>`).join("");
}

/* Income vs outflow comparison + income editor. */
function renderCashflow() {
  const income = totalIncome();
  const items = allItems();
  const fixed = items.filter(i => i.kind === "fixed").reduce((s, i) => s + i.amount, 0);
  const emi = items.filter(i => i.kind === "emi").reduce((s, i) => s + itemInMonth(i, 0), 0);
  const oneTime = items.filter(i => i.kind === "onetime").reduce((s, i) => s + itemInMonth(i, 0), 0);
  const outflow = fixed + emi + oneTime;
  const scale = Math.max(income, outflow, 1);
  const pct = v => (v / scale * 100).toFixed(1) + "%";
  const seg = (v, cls, lbl) => v > 0
    ? `<div class="seg seg-${cls}" style="width:${pct(v)}" title="${lbl}: ${INR(v)}"></div>` : "";

  const bars = `
    <div class="cf-bar-row">
      <div class="cf-bar-label">Income</div>
      <div class="cf-bar"><div class="seg seg-income" style="width:${pct(income)}"></div></div>
      <div class="cf-bar-val num">${income > 0 ? INR(income) : "—"}</div>
    </div>
    <div class="cf-bar-row">
      <div class="cf-bar-label">Outflow</div>
      <div class="cf-bar">${seg(fixed,"fixed","Fixed")}${seg(emi,"emi","EMIs")}${seg(oneTime,"one","One-time")}</div>
      <div class="cf-bar-val num">${INR(outflow)}</div>
    </div>
    <div class="cf-legend">
      <span><i class="dot seg-fixed"></i>Fixed ${INR(fixed)}</span>
      <span><i class="dot seg-emi"></i>EMIs ${INR(emi)}</span>
      <span><i class="dot seg-one"></i>One-time ${INR(oneTime)}</span>
    </div>
    <p class="hint">Note: ₹5,000 NPS inside "Fixed" is itself long-term savings, so your real savings this month are a bit higher than the headline rate.</p>`;

  const list = (state.income || []).map(inc => `
    <div class="inc-row">
      <span class="inc-name">${inc.name}</span>
      <span class="inc-amt num">${INR(inc.amount)}</span>
      <button class="del inc-del" data-id="${inc.id}">✕</button>
    </div>`).join("") || `<p class="hint">No income added yet — add your take-home pay to unlock the savings rate.</p>`;

  document.getElementById("cashflow").innerHTML = `${bars}
    <div class="inc-editor">
      <div class="inc-list">${list}</div>
      <form id="income-form" class="inc-form">
        <input name="name" type="text" placeholder="Income source (e.g. Salary)" required>
        <input name="amount" type="number" placeholder="Amount ₹" required>
        <button type="submit" class="btn-primary">Add income</button>
      </form>
    </div>`;

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

/* 12-month projection bar chart (pure SVG). */
function renderProjection() {
  const months = 12;
  const data = Array.from({ length: months }, (_, m) => ({ label: monthLabel(m), value: monthTotal(m) }));
  const income = totalIncome();
  const max = Math.max(...data.map(d => d.value), income, 1);
  const W = 760, H = 240, padL = 8, padB = 34, padT = 10;
  const bw = (W - padL) / months;
  const barW = bw * 0.6;
  const plotH = H - padB - padT;

  const bars = data.map((d, i) => {
    const h = (d.value / max) * plotH;
    const x = padL + i * bw + (bw - barW) / 2;
    const y = H - padB - h;
    const isNow = i === 0;
    const over = income > 0 && d.value > income;
    return `
      <g>
        <rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="3"
              fill="${over ? "var(--danger)" : isNow ? "var(--accent)" : "var(--bar)"}"></rect>
        <text x="${x + barW / 2}" y="${y - 5}" class="bar-val">${(d.value/1000).toFixed(0)}k</text>
        <text x="${x + barW / 2}" y="${H - padB + 16}" class="bar-lbl ${isNow ? "now" : ""}">${d.label}</text>
      </g>`;
  }).join("");

  let incomeLine = "";
  if (income > 0) {
    const y = H - padB - (income / max) * plotH;
    incomeLine = `
      <line x1="${padL}" y1="${y}" x2="${W}" y2="${y}" stroke="var(--credit)" stroke-width="1.5" stroke-dasharray="5 4"></line>
      <text x="${W - 4}" y="${y - 5}" class="bar-val" text-anchor="end" fill="var(--credit)">income ${(income/1000).toFixed(0)}k</text>`;
  }

  document.getElementById("projection").innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet">${bars}${incomeLine}</svg>
    <p class="hint">Each bar is your total outflow that month; bars shrink as EMIs finish. ${income > 0 ? "The green line is your income — bars above it (red) are months you overspend." : "Add income to see it as a reference line here."}</p>`;
}

/* Breakdown by source (card) for this month, as horizontal bars. */
function renderBreakdown() {
  const bySource = {};
  allItems().forEach(it => {
    const v = itemInMonth(it, 0);
    if (v === 0) return;
    bySource[it.source] = (bySource[it.source] || 0) + v;
  });
  const rows = Object.entries(bySource).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...rows.map(r => r[1]), 1);
  document.getElementById("breakdown").innerHTML = rows.map(([src, val]) => `
    <div class="bd-row">
      <div class="bd-name">${src}</div>
      <div class="bd-track"><div class="bd-fill" style="width:${(val/max*100).toFixed(1)}%"></div></div>
      <div class="bd-val">${INR(val)}</div>
    </div>`).join("");
}

/* Full itemized table. */
function renderTable() {
  const items = allItems();
  const kindLabel = { emi: "EMI", fixed: "Fixed", onetime: "One-time" };
  const kindOrder = { emi: 0, fixed: 1, onetime: 2 };
  items.sort((a, b) => (kindOrder[a.kind] - kindOrder[b.kind]) || (itemInMonth(b,0) - itemInMonth(a,0)));

  const body = items.map(it => {
    const thisM = itemInMonth(it, 0);
    let schedule = "—";
    if (it.kind === "emi") {
      schedule = `${it.monthsRemaining} left · ends ${monthLabel(it.monthsRemaining - 1)}`;
    } else if (it.kind === "fixed") {
      schedule = "every month";
    } else if (it.kind === "onetime") {
      schedule = "this month only";
    }
    const credit = thisM < 0;
    return `
      <tr>
        <td>${it.name}${it._txn ? ' <span class="tag">captured</span>' : ''}</td>
        <td>${it.source}</td>
        <td><span class="pill pill-${it.kind}">${kindLabel[it.kind]}</span></td>
        <td class="num ${credit ? "credit" : ""}">${credit ? "+" : ""}${INR(Math.abs(thisM))}</td>
        <td class="sched">${schedule}</td>
        <td>${it._txn ? `<button class="del" data-id="${it.id}">✕</button>` : ""}</td>
      </tr>`;
  }).join("");

  document.getElementById("table-body").innerHTML = body;
  document.querySelectorAll(".del").forEach(btn => {
    btn.onclick = () => {
      state.transactions = state.transactions.filter(t => t.id !== btn.dataset.id);
      render();
    };
  });
}

/* ---------- parser UI ---------- */
function handleParse() {
  const text = document.getElementById("msg-input").value;
  const parsed = parseTxnMessage(text);
  const out = document.getElementById("parse-result");
  if (!parsed || parsed.amount == null) {
    out.innerHTML = `<div class="warn">Couldn't find an amount in that message. You can still add it manually below.</div>`;
    return;
  }
  out.innerHTML = `
    <div class="parsed">
      <div class="parsed-grid">
        <label>Amount <input id="p-amount" type="number" value="${parsed.amount}"></label>
        <label>Merchant <input id="p-merchant" type="text" value="${parsed.merchant}"></label>
        <label>Card / Source <input id="p-source" type="text" value="${parsed.source}"></label>
        <label>Direction
          <select id="p-dir">
            <option value="debit" ${parsed.direction==="debit"?"selected":""}>Debit (spent)</option>
            <option value="credit" ${parsed.direction==="credit"?"selected":""}>Credit (received)</option>
          </select>
        </label>
        <label>Category <input id="p-cat" type="text" value="Captured"></label>
      </div>
      <button id="confirm-add" class="btn-primary">Add to dashboard</button>
    </div>`;
  document.getElementById("confirm-add").onclick = () => {
    state.transactions.push({
      id: uid(),
      amount: parseFloat(document.getElementById("p-amount").value) || 0,
      merchant: document.getElementById("p-merchant").value,
      source: document.getElementById("p-source").value,
      direction: document.getElementById("p-dir").value,
      category: document.getElementById("p-cat").value,
      raw: parsed.raw,
    });
    document.getElementById("msg-input").value = "";
    out.innerHTML = `<div class="ok">Added ✓</div>`;
    render();
  };
}

/* ---------- manual add ---------- */
function handleManualAdd(e) {
  e.preventDefault();
  const f = e.target;
  const item = {
    id: uid(),
    name: f.name.value.trim() || "Untitled",
    source: f.source.value.trim() || "Manual",
    category: f.category.value.trim() || "Other",
    kind: f.kind.value,
    amount: parseFloat(f.amount.value) || 0,
  };
  if (item.kind === "emi") item.monthsRemaining = parseInt(f.months.value) || 1;
  state.commitments.push(item);
  f.reset();
  render();
}

/* ---------- wire up ---------- */
document.getElementById("parse-btn").onclick = handleParse;
document.getElementById("manual-form").addEventListener("submit", handleManualAdd);
document.getElementById("reset-btn").onclick = () => {
  if (confirm("Reset ALL data back to the seeded values? This clears captured transactions and edits.")) {
    localStorage.removeItem(STORAGE_KEY);
    state = loadState();
    render();
  }
};
document.getElementById("months-wrap").style.display = "none";
document.querySelector('#manual-form select[name="kind"]').addEventListener("change", e => {
  document.getElementById("months-wrap").style.display = e.target.value === "emi" ? "block" : "none";
});

render();
