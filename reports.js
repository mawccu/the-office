/* ============================================================
   Reports — where the money goes each month (stacked bars by
   category) and each member's deposits vs. their share paid.
   Plain SVG; colors are the validated categorical slots from
   style.css (--series-1..8), assigned in fixed order.
   ============================================================ */
renderNav("reports");

const $ = (id) => document.getElementById(id);
let S = null;
const SERIES = 8;

onFund = async () => {
  try {
    const { data, error } = await sb.rpc("fund_stats", { p_name: auth.name, p_pin: auth.pin });
    if (error) throw error;
    S = data;
    render();
  } catch (e) { toast(e.message || String(e)); }
};
document.addEventListener("themechange", () => S && render());

function monthsFrom(from, n = 12) {
  const out = []; const d = new Date(from + "T00:00:00");
  for (let i = 0; i < n; i++) { out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); d.setMonth(d.getMonth() + 1); }
  return out;
}
function monthLabel(m, long) { const [y, mo] = m.split("-").map(Number); return new Date(y, mo - 1, 1).toLocaleDateString([], long ? { month: "long", year: "numeric" } : { month: "short" }); }
function niceMax(v) { if (v <= 0) return 10000; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }

function render() {
  let months = monthsFrom(S.from);
  const firstUsed = months.findIndex((m) => S.spend.some((x) => x.month === m) || S.deposits.some((x) => x.month === m));
  if (firstUsed > 0) months = months.slice(Math.min(firstUsed, months.length - 3));
  // categories: biggest first; more than 8 fold into "Other"
  const totals = {};
  S.spend.forEach((x) => { totals[x.category] = (totals[x.category] || 0) + x.fils; });
  let cats = Object.keys(totals).sort((a, b) => totals[b] - totals[a]);
  const fold = cats.length > SERIES ? cats.slice(SERIES - 1) : [];
  if (fold.length) cats = cats.slice(0, SERIES - 1).concat("Other");
  const catOf = (c) => (fold.includes(c) ? "Other" : c);
  const grid = months.map((m) => {
    const row = { month: m, total: 0 };
    cats.forEach((c) => (row[c] = 0));
    S.spend.filter((x) => x.month === m).forEach((x) => { row[catOf(x.category)] += x.fils; row.total += x.fils; });
    return row;
  });

  const year = grid.reduce((s, r) => s + r.total, 0);
  const thisMonth = grid[grid.length - 1]?.total || 0;
  const usedMonths = grid.filter((r) => r.total > 0).length || 1;
  const pool = S.people.reduce((s, p) => s + p.balance, 0);
  $("tiles").innerHTML = [
    ["Spent this month", jd(thisMonth)],
    ["Spent in the last 12 months", jd(year)],
    ["Average a month", jd(Math.round(year / usedMonths))],
    ["In the fund now", balanceText(pool)],
  ].map(([l, v]) => `<div class="metric"><span>${esc(l)}</span><b>${esc(v)}</b></div>`).join("");

  renderSpend(grid, cats);
  renderPeople();
}

/* ---------- spending by month ---------- */
function renderSpend(grid, cats) {
  if (!grid.some((r) => r.total > 0)) {
    $("spendChart").innerHTML = emptyBlock("Nothing spent yet. Charged bills and purchases show up here.");
    $("spendLegend").innerHTML = ""; $("spendTable").innerHTML = ""; return;
  }
  const W = 720, H = 300, L = 56, R = 12, T = 14, B = 34;
  const max = niceMax(Math.max(...grid.map((r) => r.total)));
  const bw = (W - L - R) / grid.length, barW = Math.min(44, bw * 0.62);
  const y = (v) => T + (H - T - B) * (1 - v / max);
  let g = "", hits = "";
  for (let i = 0; i <= 4; i++) {
    const v = (max / 4) * i, yy = y(v);
    g += `<line class="ax-grid" x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}"></line><text class="ax-lbl" x="${L - 8}" y="${yy + 4}" text-anchor="end">${esc(jdShort(v).replace(/\.000$/, ""))}</text>`;
  }
  grid.forEach((r, i) => {
    const x = L + bw * i + (bw - barW) / 2;
    let acc = 0;
    const segs = cats.map((c, ci) => ({ c, ci, v: r[c] })).filter((s) => s.v > 0);
    segs.forEach((s, k) => {
      const y1 = y(acc + s.v), y0 = y(acc);
      const h = Math.max(1, y0 - y1 - (k > 0 ? 2 : 0)); // 2px surface gap between stacked segments
      const top = k === segs.length - 1;
      g += `<path class="bar s${(s.ci % SERIES) + 1}" d="${barPath(x, y1, barW, h, top ? 4 : 0)}" data-tip="${esc(`${monthLabel(r.month, true)} · ${s.c}: ${jd(s.v)}`)}"></path>`;
      acc += s.v;
    });
    g += `<text class="ax-lbl" x="${x + barW / 2}" y="${H - 12}" text-anchor="middle">${esc(monthLabel(r.month))}</text>`;
    if (r.total > 0) hits += `<rect class="hit" x="${L + bw * i}" y="${T}" width="${bw}" height="${H - T - B}" data-tip="${esc(`${monthLabel(r.month, true)}: ${jd(r.total)} total`)}"></rect>`;
  });
  g += `<line class="ax-base" x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}"></line>`;
  $("spendChart").innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="chart-svg" role="img" aria-label="Spending per month by category">${hits}${g}</svg><div class="chart-tip" hidden></div>`;
  wireTips($("spendChart"));
  $("spendLegend").innerHTML = cats.map((c, i) => `<span class="lg"><i class="lg-sw s${(i % SERIES) + 1}"></i>${esc(c)}</span>`).join("");
  $("spendTable").innerHTML = `<table class="data-table"><thead><tr><th>Month</th>${cats.map((c) => `<th>${esc(c)}</th>`).join("")}<th>Total</th></tr></thead><tbody>
    ${grid.filter((r) => r.total > 0).map((r) => `<tr><td>${esc(monthLabel(r.month, true))}</td>${cats.map((c) => `<td>${r[c] ? esc(jdShort(r[c])) : "–"}</td>`).join("")}<td><b>${esc(jdShort(r.total))}</b></td></tr>`).join("")}
  </tbody></table>`;
}
// bar with rounded top corners only, anchored flat to the baseline
function barPath(x, y, w, h, r) {
  r = Math.min(r, w / 2, h);
  if (!r) return `M${x},${y}h${w}v${h}h${-w}z`;
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}z`;
}

/* ---------- each member: deposited vs paid ---------- */
function renderPeople() {
  const P = S.people;
  if (!P.length) { $("peopleChart").innerHTML = emptyBlock("No members yet."); return; }
  const max = niceMax(Math.max(1, ...P.map((p) => Math.max(p.deposited, p.paid))));
  const W = 720, rowH = 46, L = 96, R = 70, T = 6, H = T + rowH * P.length + 8;
  const x = (v) => L + (W - L - R) * (v / max);
  let g = "", hits = "";
  for (let i = 0; i <= 4; i++) { const xx = x((max / 4) * i); g += `<line class="ax-grid" x1="${xx}" x2="${xx}" y1="${T}" y2="${H - 8}"></line>`; }
  P.forEach((p, i) => {
    const y0 = T + i * rowH + 6;
    g += `<text class="ax-name" x="${L - 10}" y="${y0 + 19}" text-anchor="end">${esc(p.name)}</text>`;
    [["deposited", 1, "Deposited"], ["paid", 2, "Paid (share of bills and buys)"]].forEach(([k, s, lab], j) => {
      const yy = y0 + j * 16, w = Math.max(p[k] > 0 ? 3 : 0, x(p[k]) - L);
      g += `<path class="bar s${s}" d="M${L},${yy}h${Math.max(0, w - 4)}q4,0 4,4v4q0,4 -4,4h${-Math.max(0, w - 4)}z" data-tip="${esc(`${p.name} · ${lab}: ${jd(p[k])}`)}"></path>`;
    });
    g += `<text class="ax-val ${p.balance < 0 ? "neg" : ""}" x="${W - R + 8}" y="${y0 + 19}">${esc(p.balance < 0 ? "−" + jdShort(-p.balance) : jdShort(p.balance))}</text>`;
    hits += `<rect class="hit" x="0" y="${y0 - 4}" width="${W}" height="${rowH - 4}" data-tip="${esc(`${p.name}: deposited ${jd(p.deposited)}, paid ${jd(p.paid)}, balance ${balanceText(p.balance)}`)}"></rect>`;
  });
  $("peopleChart").innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="chart-svg" role="img" aria-label="Each member's deposits and share paid">${hits}${g}</svg><div class="chart-tip" hidden></div>`;
  wireTips($("peopleChart"));
  $("peopleLegend").innerHTML = `<span class="lg"><i class="lg-sw s1"></i>Deposited</span><span class="lg"><i class="lg-sw s2"></i>Paid (share of bills and buys)</span><span class="lg lg-note">Right column: balance now</span>`;
  $("peopleTable").innerHTML = `<table class="data-table"><thead><tr><th>Member</th><th>Deposited</th><th>Paid</th><th>Balance</th></tr></thead><tbody>
    ${P.map((p) => `<tr><td>${esc(p.name)}</td><td>${esc(jdShort(p.deposited))}</td><td>${esc(jdShort(p.paid))}</td><td class="${p.balance < 0 ? "neg" : ""}"><b>${esc(balanceText(p.balance))}</b></td></tr>`).join("")}
  </tbody></table>`;
}

/* ---------- hover tooltips ---------- */
function wireTips(box) {
  const tip = box.querySelector(".chart-tip");
  box.querySelectorAll("[data-tip]").forEach((el) => {
    const show = (e) => {
      tip.textContent = el.dataset.tip; tip.hidden = false;
      const r = box.getBoundingClientRect();
      const cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left, cy = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
      tip.style.left = Math.min(Math.max(cx, 80), r.width - 80) + "px"; tip.style.top = Math.max(cy - 12, 0) + "px";
    };
    el.addEventListener("mousemove", show); el.addEventListener("touchstart", show, { passive: true });
    el.addEventListener("mouseleave", () => (tip.hidden = true));
  });
}
$("tableToggle")?.addEventListener("click", () => {
  const open = document.body.classList.toggle("show-tables");
  $("tableToggle").textContent = open ? "Hide tables" : "Show as tables";
});
