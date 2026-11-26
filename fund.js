/* ============================================================
   Office fund — home: floor plan, your wallet + deposits, forecast,
   notifications, your money history, monthly statements.
   ============================================================ */
renderNav("fund");

const $ = (id) => document.getElementById(id);

onFund = () => {
  const me = F.me;
  const pool = F.members.reduce((s, m) => s + m.balance_fils, 0);
  $("statPool").textContent = jd(pool);
  $("statMine").textContent = me.role === "admin" ? "Admin" : balanceText(me.balance_fils);
  $("statMine").classList.toggle("owed", me.role !== "admin" && me.balance_fils < 0);
  $("statMine").style.color = me.role === "admin" ? "var(--ink)" : "";
  renderFundPlan($("fundPlan"));
  if (me.role === "admin") renderAdminWallet(pool); else renderWallet();
  renderForecast(pool);
  const ow = F.o?.cash?.owes_admin || 0;
  $("owesBanner").hidden = !(ow > 0) || isAdmin();
  if (ow > 0) $("owesBanner").innerHTML = `${icon("wallet")}<span>The fund owes the admin <b>${jd(ow)}</b>. He paid more for the office than has been deposited. It evens out as members who owe make deposits.</span>`;
  $("notifList").innerHTML = notificationsHtml(F.notifications);
  wireNotifications($("notifList"));
  $("activity").hidden = me.role === "admin";
  $("statements").hidden = me.role === "admin";
  if (me.role !== "admin") { renderTx(); renderStatements(); }
  if (location.hash && !onFund.scrolled) { onFund.scrolled = true; setTimeout(() => document.querySelector(location.hash)?.scrollIntoView({ block: "start" }), 50); }
};
$("markAll").addEventListener("click", markAllRead);

/* ---------- wallet ---------- */
function renderWallet() {
  const me = F.me, st = balanceState(me.balance_fils);
  const desk = FUND_PLAN.desks.find((d) => d.id === me.desk_id);
  const pending = F.deposits.filter((d) => d.status === "pending");
  const recent = F.deposits.filter((d) => d.status === "rejected").slice(0, 2);
  $("wallet").innerHTML = `
    <div class="card-head"><span>Your wallet</span><span class="hint">${desk ? esc(desk.label) : "No desk"}</span></div>
    <div class="card-body">
      <div class="wallet-bal ${st}">
        <span class="wb-label">${me.balance_fils < 0 ? "You owe" : "Your balance"}</span>
        <span class="wb-val">${jd(Math.abs(me.balance_fils))}</span>
        ${me.pending_fils > 0 ? `<span class="wb-pend">+${jd(me.pending_fils)} waiting for the admin to approve</span>` : ""}
      </div>
      <button class="btn primary wide" id="depositBtn">${icon("plus")} Deposit</button>
      ${pending.map((d) => `
        <div class="dep-row"><div><b>${jd(d.amount_fils)}</b> · ${esc(METHOD_LABEL[d.method] || d.method)}<div class="dep-sub">Sent ${esc(fmtDate(d.created_at))}${d.note ? " · " + esc(d.note) : ""} ${photoLinks(d.id)}</div></div>
        <button class="linkbtn" data-cancel="${d.id}">Cancel</button></div>`).join("")}
      ${recent.map((d) => `<div class="dep-row rejected"><div><b>${jd(d.amount_fils)}</b> rejected<div class="dep-sub">${esc(d.reason || "")}</div></div></div>`).join("")}
    </div>`;
  $("depositBtn").addEventListener("click", openDeposit);
  wirePhotoLinks($("wallet"));
  $("wallet").querySelectorAll("[data-cancel]").forEach((b) => b.addEventListener("click", () => {
    if (confirm("Cancel this deposit request?")) callRpc("fund_cancel_deposit", { p_id: b.dataset.cancel }, "Deposit request cancelled");
  }));
}

function renderAdminWallet(pool) {
  const owing = F.members.filter((m) => m.balance_fils < 0);
  const pend = F.admin?.pending_deposits.length || 0;
  const due = F.charges.filter((c) => c.status === "due").length;
  const ready = F.proposals.filter((p) => p.status === "approved").length;
  $("wallet").innerHTML = `
    <div class="card-head"><span>You're the admin</span><span class="hint">No desk, no share</span></div>
    <div class="card-body">
      <div class="wallet-bal ${pool < 0 ? "owed" : "ok"}"><span class="wb-label">Total in the fund</span><span class="wb-val">${esc(balanceText(pool))}</span></div>
      <div class="todo-list">
        <a class="todo ${pend ? "hot" : ""}" href="admin.html#deposits"><b>${pend}</b> deposit${pend === 1 ? "" : "s"} to approve</a>
        <a class="todo ${due ? "hot" : ""}" href="admin.html#bills"><b>${due}</b> bill${due === 1 ? "" : "s"} to confirm</a>
        <a class="todo ${ready ? "hot" : ""}" href="admin.html#purchase"><b>${ready}</b> approved item${ready === 1 ? "" : "s"} to buy</a>
        <a class="todo ${owing.length ? "hot" : ""}" href="admin.html#members"><b>${owing.length}</b> member${owing.length === 1 ? "" : "s"} owing</a>
      </div>
      <a class="btn primary wide" href="admin.html">Open the admin panel</a>
    </div>`;
}

function openDeposit() {
  openSheet("Deposit money", "Tell the admin how much you're adding. It counts once the admin confirms they got it.", `
    <div class="auth-fields">
      <input id="dAmt" class="fld" type="text" inputmode="decimal" placeholder="Amount in JD, like 50" />
      <div class="seg" id="dMethod">
        ${["cash", "cliq", "bank", "other"].map((m, i) => `<button type="button" class="seg-btn ${i === 0 ? "on" : ""}" data-m="${m}">${METHOD_LABEL[m]}</button>`).join("")}
      </div>
      <input id="dNote" class="fld" type="text" maxlength="120" placeholder="Note (optional), like a CliQ reference" />
      ${photoInputHtml("dPhoto", "Add a payment screenshot (optional)")}
    </div>
    <div class="auth-err sheet-err"></div>
    <div class="modal-actions"><button class="btn ghost" id="dCancel">Cancel</button><button class="btn primary" id="dSend">Send request</button></div>`,
    (m) => {
      let method = "cash";
      m.querySelectorAll(".seg-btn").forEach((b) => b.addEventListener("click", () => {
        method = b.dataset.m; m.querySelectorAll(".seg-btn").forEach((x) => x.classList.toggle("on", x === b));
      }));
      const photo = wirePhotoInput(m, "dPhoto");
      m.querySelector("#dCancel").addEventListener("click", closeSheet);
      m.querySelector("#dSend").addEventListener("click", async () => {
        const amt = parseJD(m.querySelector("#dAmt").value);
        if (!amt) return sheetError(m, "Enter an amount in JD, up to 3 decimals");
        const btn = m.querySelector("#dSend"); btn.disabled = true;
        try {
          const { data: id, error } = await sb.rpc("fund_request_deposit", { p_name: auth.name, p_pin: auth.pin, p_amount: amt, p_method: method, p_note: m.querySelector("#dNote").value });
          if (error) throw error;
          await uploadPhoto(id, photo());
          toast("Deposit sent to the admin");
          closeSheet();
          await loadFund();
        } catch (e) { sheetError(m, e.message || String(e)); } finally { btn.disabled = false; }
      });
    });
}

/* ---------- forecast ---------- */
function renderForecast(pool) {
  const admin = isAdmin();
  let body;
  if (admin) {
    const willOwe = F.members.filter((m) => forecastFor(m.balance_fils).after < 0);
    body = forecastHtml(pool, "fund") +
      (willOwe.length ? `<div class="fc-foot">Will owe after these: ${willOwe.map((m) => esc(m.name)).join(", ")}.</div>` : "");
  } else {
    body = forecastHtml(F.me.balance_fils);
  }
  $("forecast").innerHTML = `
    <div class="card-head"><span>Fund forecast</span><span class="hint">Next 30 days${admin ? " · whole fund" : " · your share"}</span></div>
    <div class="card-body">${body}</div>`;
}

/* ---------- your money ---------- */
function renderTx() {
  let run = F.me.balance_fils;
  const rows = F.tx.map((t) => {
    const after = run; run -= t.amount_fils;
    return `<div class="tx-row k-${esc(t.kind)}">
      <span class="tx-ico">${icon(t.kind === "deposit" ? "wallet" : t.kind === "bill" ? "calendar" : "receipt")}</span>
      <span class="tx-main"><span class="tx-memo">${esc(t.memo)}</span><span class="tx-when">${esc(fmtDate(t.created_at))} ${t.ref_id ? photoLinks(t.ref_id) : ""}</span></span>
      <span class="tx-amt ${t.amount_fils > 0 ? "in" : "out"}">${jdSigned(t.amount_fils)}</span>
      <span class="tx-run">${esc(balanceText(after))}</span>
    </div>`;
  }).join("");
  $("txList").innerHTML = rows || emptyBlock("No money movements yet. Make your first deposit above.");
  wirePhotoLinks($("txList"));
}

/* ---------- statements ---------- */
function renderStatements() {
  const list = F.statements;
  $("stmtList").innerHTML = list.length ? list.map((s) => `
    <button class="stmt-row" data-p="${s.period}">
      <span class="stmt-month">${esc(fmtMonth(s.period))}</span>
      <span class="stmt-fig">Money in <b class="in">${jdShort(s.in_fils)}</b></span>
      <span class="stmt-fig">Money out <b class="out">${jdShort(s.out_fils)}</b></span>
      <span class="stmt-fig">Closing <b class="${s.closing_fils < 0 ? "out" : ""}">${esc(balanceText(s.closing_fils))}</b></span>
    </button>`).join("")
    : emptyBlock("Your first statement arrives on the 1st of next month.");
  $("stmtList").querySelectorAll(".stmt-row").forEach((b) => b.addEventListener("click", () => openStatement(b.dataset.p)));
}
function openStatement(period) {
  const s = F.statements.find((x) => x.period === period);
  const start = new Date(period + "T00:00:00"), end = new Date(start); end.setMonth(end.getMonth() + 1);
  const tx = F.tx.filter((t) => { const d = new Date(t.created_at); return d >= start && d < end; }).reverse();
  openSheet(`${fmtMonth(period)} statement`, `${esc(F.me.name)} · Malek's office fund`, `
    <div class="print-area">
      <div class="stmt-sum">
        <div><span>Opening</span><b>${esc(balanceText(s.opening_fils))}</b></div>
        <div><span>Money in</span><b class="in">+${jdShort(s.in_fils)}</b></div>
        <div><span>Money out</span><b class="out">−${jdShort(s.out_fils)}</b></div>
        <div><span>Closing</span><b>${esc(balanceText(s.closing_fils))}</b></div>
      </div>
      <div class="stmt-tx">${tx.map((t) => `<div><span>${esc(fmtDay(t.created_at))}</span><span>${esc(t.memo)}</span><b class="${t.amount_fils > 0 ? "in" : "out"}">${jdSigned(t.amount_fils)}</b></div>`).join("")
        || `<div class="fc-foot">No movements this month.</div>`}</div>
    </div>
    <div class="modal-actions"><button class="btn ghost" id="sClose">Close</button><button class="btn primary" id="sPrint">Print or save as PDF</button></div>`,
    (m) => {
      m.querySelector("#sClose").addEventListener("click", closeSheet);
      m.querySelector("#sPrint").addEventListener("click", () => window.print());
    });
}
