/* ============================================================
   Fund admin — approve deposits, confirm monthly bills, record
   purchases (split exactly between all members), manage desks,
   reverse mistakes. Every action notifies the people it touches.
   ============================================================ */
renderNav("admin");

const $ = (id) => document.getElementById(id);
const buyParam = new URLSearchParams(location.search).get("buy");
let purchaseDraft = { title: "", total: "", note: "", proposal: buyParam || "" };

onFund = () => {
  if (!isAdmin()) {
    fundGate(`<div class="composer-empty"><div class="ce-title">Only the admin can open this page</div>
      <div class="ce-sub">Your balance and deposits are on the <a href="fund.html">Fund</a> page.</div></div>`);
    return;
  }
  const pool = F.members.reduce((s, m) => s + m.balance_fils, 0);
  const owing = F.members.filter((m) => m.balance_fils < 0);
  const due = F.charges.filter((c) => c.status === "due");
  const ready = F.proposals.filter((p) => p.status === "approved");
  $("adminMetrics").innerHTML = [
    ["Fund total", balanceText(pool), pool < 0 ? "owed" : ""],
    ["Deposits to approve", F.admin.pending_deposits.length, F.admin.pending_deposits.length ? "hot" : ""],
    ["Bills to confirm", due.length, due.length ? "hot" : ""],
    ["Approved to buy", ready.length, ready.length ? "hot" : ""],
    ["Members owing", owing.length, owing.length ? "owed" : ""],
  ].map(([l, v, c]) => `<div class="metric ${c}"><span>${esc(l)}</span><b>${esc(String(v))}</b></div>`).join("");
  renderDeposits();
  renderDue(due);
  renderBillSetup();
  if (!purchaseTyping()) renderPurchase(ready);
  $("adminForecast").innerHTML = forecastHtml(pool, "fund") + willOweHtml();
  renderMembers();
  renderEvents();
  renderCash();
  renderBackups();
  $("notifList").innerHTML = notificationsHtml(F.notifications);
  wireNotifications($("notifList"));
  if (location.hash && !onFund.scrolled) { onFund.scrolled = true; setTimeout(() => document.querySelector(location.hash)?.scrollIntoView({ block: "start" }), 50); }
};
$("markAll").addEventListener("click", markAllRead);
$("newBill").addEventListener("click", () => openBill(null));

/* ---------- deposits ---------- */
function renderDeposits() {
  const list = F.admin.pending_deposits;
  $("depList").innerHTML = list.length ? list.map((d) => `
    <div class="adm-row">
      <div class="adm-main"><b>${esc(d.user_name)} · ${jd(d.amount_fils)}</b>
        <span class="adm-sub">${esc(METHOD_LABEL[d.method] || d.method)}${d.note ? " · " + esc(d.note) : ""} · ${esc(fmtDate(d.created_at))} ${photoLinks(d.id)}</span></div>
      <div class="adm-act"><button class="btn ghost small" data-rej="${d.id}">Reject</button><button class="btn primary small" data-ok="${d.id}">Approve</button></div>
    </div>`).join("") : emptyBlock("No deposits waiting.");
  wirePhotoLinks($("depList"));
  $("depList").querySelectorAll("[data-ok]").forEach((b) => b.addEventListener("click", () => {
    const d = list.find((x) => x.id === b.dataset.ok);
    if (confirm(`Approve ${jd(d.amount_fils)} from ${d.user_name}? Only do this once you have the money.`))
      callRpc("fund_decide_deposit", { p_id: d.id, p_approve: true, p_reason: null }, `Approved. ${d.user_name} has been notified.`);
  }));
  $("depList").querySelectorAll("[data-rej]").forEach((b) => b.addEventListener("click", () => {
    const d = list.find((x) => x.id === b.dataset.rej);
    openSheet(`Reject ${jd(d.amount_fils)} from ${d.user_name}`, "They'll see your reason.", `
      <div class="auth-fields"><input id="rReason" class="fld" type="text" maxlength="160" placeholder="I didn't receive it yet" /></div>
      <div class="auth-err sheet-err"></div>
      <div class="modal-actions"><button class="btn ghost" id="rCancel">Cancel</button><button class="btn danger" id="rSend">Reject</button></div>`,
      (m) => {
        m.querySelector("#rCancel").addEventListener("click", closeSheet);
        m.querySelector("#rSend").addEventListener("click", async () => {
          const r = m.querySelector("#rReason").value.trim();
          if (!r) return sheetError(m, "Give a reason");
          if (await callRpc("fund_decide_deposit", { p_id: d.id, p_approve: false, p_reason: r }, "Rejected")) closeSheet();
        });
      });
  }));
}

/* ---------- bills ---------- */
function splitText(totalFils) {
  const n = memberCount();
  if (!n) return "No members yet";
  const base = Math.floor(totalFils / n), rem = totalFils % n;
  return rem === 0 ? `${n} members pay ${jd(base)} each`
    : `${rem} pay ${jd(base + 1)}, ${n - rem} pay ${jd(base)} (exact total ${jd(totalFils)})`;
}
function renderDue(due) {
  $("dueList").innerHTML = due.length ? due.map((c) => `
    <div class="adm-row col">
      <div class="adm-main"><b>${esc(c.bill_name)} · ${esc(fmtMonth(c.period))}</b>
        <span class="adm-sub">${c.suggested_fils ? (F.bills.find((b) => b.id === c.bill_id)?.amount_fils != null ? "Fixed amount" : "Estimate from recent months. Enter the real amount.") : "Enter this month's amount"}</span></div>
      <div class="adm-charge">
        <input class="fld amt" type="text" inputmode="decimal" data-amt="${c.id}" value="${c.suggested_fils ? esc(jdShort(c.suggested_fils)) : ""}" placeholder="JD" />
        <button class="btn primary small" data-charge="${c.id}">Charge everyone</button>
        <button class="linkbtn" data-skip="${c.id}">Skip</button>
      </div>
      <div class="adm-sub split" data-split="${c.id}"></div>
    </div>`).join("") : emptyBlock("No bills waiting. Bills show up here on their due day.");
  const upd = (id) => {
    const v = parseJD($("dueList").querySelector(`[data-amt="${id}"]`).value);
    $("dueList").querySelector(`[data-split="${id}"]`).textContent = v ? splitText(Math.round(v * 1000)) : "";
  };
  $("dueList").querySelectorAll("[data-amt]").forEach((i) => { i.addEventListener("input", () => upd(i.dataset.amt)); upd(i.dataset.amt); });
  $("dueList").querySelectorAll("[data-charge]").forEach((b) => b.addEventListener("click", () => {
    const c = due.find((x) => x.id === b.dataset.charge);
    const v = parseJD($("dueList").querySelector(`[data-amt="${c.id}"]`).value);
    if (!v) return toast("Enter the amount in JD");
    if (confirm(`Charge ${jd(Math.round(v * 1000))} for ${c.bill_name}?\n${splitText(Math.round(v * 1000))}.`))
      callRpc("fund_charge_bill", { p_charge: c.id, p_amount: v }, "Charged. Everyone has been notified.");
  }));
  $("dueList").querySelectorAll("[data-skip]").forEach((b) => b.addEventListener("click", () => {
    const note = prompt("Skip this bill for this month? Add a short note (optional):", "");
    if (note !== null) callRpc("fund_skip_bill", { p_charge: b.dataset.skip, p_note: note }, "Skipped");
  }));
}
function renderBillSetup() {
  const bills = F.bills;
  $("billSetup").innerHTML = `<div class="sub-head">All monthly bills</div>` + (bills.length ? bills.map((b) => `
    <button class="adm-row link ${b.active ? "" : "off"}" data-bill="${b.id}">
      <span class="adm-main"><b>${esc(b.name)}</b><span class="adm-sub">Day ${b.due_day} · ${b.amount_fils != null ? jd(b.amount_fils) : "changes monthly"}${b.active ? "" : " · paused"}</span></span>
      <span class="adm-edit">Edit</span>
    </button>`).join("") : emptyBlock("Add rent, internet, electricity and so on."));
  $("billSetup").querySelectorAll("[data-bill]").forEach((b) => b.addEventListener("click", () => openBill(F.bills.find((x) => x.id === b.dataset.bill))));
}
function openBill(b) {
  openSheet(b ? `Edit ${b.name}` : "New monthly bill", "On the due day it shows up here for you to confirm. Nobody is charged until you do.", `
    <div class="auth-fields">
      <input id="bName" class="fld" type="text" maxlength="60" placeholder="Rent" value="${esc(b?.name || "")}" />
      <input id="bAmt" class="fld" type="text" inputmode="decimal" placeholder="Amount in JD (leave empty if it changes every month)" value="${b?.amount_fils != null ? esc(jdShort(b.amount_fils)) : ""}" />
      <label class="fld-label">Due day of the month
        <select id="bDay" class="fld">${Array.from({ length: 28 }, (_, i) => i + 1).map((d) => `<option ${d === (b?.due_day || 1) ? "selected" : ""}>${d}</option>`).join("")}</select>
      </label>
      ${b ? `<label class="check"><input type="checkbox" id="bActive" ${b.active ? "checked" : ""}/> Active</label>` : ""}
    </div>
    <div class="auth-err sheet-err"></div>
    <div class="modal-actions"><button class="btn ghost" id="bCancel">Cancel</button><button class="btn primary" id="bSave">Save</button></div>`,
    (m) => {
      m.querySelector("#bCancel").addEventListener("click", closeSheet);
      m.querySelector("#bSave").addEventListener("click", async () => {
        const name = m.querySelector("#bName").value.trim();
        const raw = m.querySelector("#bAmt").value.trim();
        const amt = raw ? parseJD(raw) : null;
        if (!name) return sheetError(m, "Name the bill");
        if (raw && !amt) return sheetError(m, "Enter the amount in JD, up to 3 decimals, or leave it empty");
        const ok = await callRpc("fund_save_bill", {
          p_id: b?.id || null, p_bill_name: name, p_amount: amt, p_due_day: Number(m.querySelector("#bDay").value),
          p_active: b ? m.querySelector("#bActive").checked : true,
        }, "Bill saved");
        if (ok) closeSheet();
      });
    });
}

/* ---------- purchase ---------- */
function purchaseTyping() {
  const a = document.activeElement;
  return a && $("purchaseForm").contains(a) && (a.tagName === "INPUT" || a.tagName === "TEXTAREA");
}
function renderPurchase(ready) {
  if (purchaseDraft.proposal && !ready.some((p) => p.id === purchaseDraft.proposal)) purchaseDraft.proposal = "";
  if (purchaseDraft.proposal && !purchaseDraft.title) {
    const p = ready.find((x) => x.id === purchaseDraft.proposal);
    purchaseDraft.title = p.title; purchaseDraft.total = jdShort(p.price_fils);
  }
  $("purchaseForm").innerHTML = `
    ${ready.length ? `<label class="fld-label">From the wishlist
      <select id="buyFrom" class="fld"><option value="">Not from the wishlist</option>
        ${ready.map((p) => `<option value="${p.id}" ${p.id === purchaseDraft.proposal ? "selected" : ""}>${esc(p.title)} · ${jd(p.price_fils)} (approved)</option>`).join("")}
      </select></label>` : ""}
    <div class="auth-fields">
      <input id="buyTitle" class="fld" type="text" maxlength="120" placeholder="What you bought, like TV" value="${esc(purchaseDraft.title)}" />
      <input id="buyTotal" class="fld" type="text" inputmode="decimal" placeholder="Total paid in JD" value="${esc(purchaseDraft.total)}" />
      <input id="buyNote" class="fld" type="text" maxlength="160" placeholder="Note (optional), like the shop" value="${esc(purchaseDraft.note)}" />
      ${photoInputHtml("buyPhoto", "Add the receipt photo (optional)")}
    </div>
    <div class="split-preview" id="buySplit"></div>
    <button class="btn primary wide" id="buyGo">Charge everyone</button>`;
  const upd = () => {
    purchaseDraft.title = $("buyTitle").value; purchaseDraft.total = $("buyTotal").value; purchaseDraft.note = $("buyNote").value;
    const v = parseJD(purchaseDraft.total);
    const n = memberCount();
    if (!v) { $("buySplit").innerHTML = `Split between ${n} members. Enter the total to see each share.`; return; }
    const owe = F.members.filter((m) => m.balance_fils - Math.ceil(v * 1000 / n) < 0).map((m) => m.name);
    $("buySplit").innerHTML = `<b>${esc(splitText(Math.round(v * 1000)))}</b>${owe.length ? `<span class="owe-note">Will owe after this: ${esc(owe.join(", "))}</span>` : ""}`;
  };
  ["buyTitle", "buyTotal", "buyNote"].forEach((id) => $(id).addEventListener("input", upd));
  $("buyFrom")?.addEventListener("change", (e) => {
    purchaseDraft.proposal = e.target.value;
    const p = ready.find((x) => x.id === e.target.value);
    if (p) { purchaseDraft.title = p.title; purchaseDraft.total = jdShort(p.price_fils); }
    renderPurchase(ready);
  });
  upd();
  const buyPhoto = wirePhotoInput($("purchaseForm"), "buyPhoto");
  $("buyGo").addEventListener("click", async () => {
    const title = $("buyTitle").value.trim(), v = parseJD($("buyTotal").value);
    if (!title) return toast("Say what you bought");
    if (!v) return toast("Enter the total in JD, up to 3 decimals");
    if (!confirm(`Charge ${jd(Math.round(v * 1000))} for “${title}”?\n${splitText(Math.round(v * 1000))}.\nEveryone gets notified.`)) return;
    let ok = false;
    try {
      const { data: pid, error } = await sb.rpc("fund_record_purchase", { p_name: auth.name, p_pin: auth.pin, p_title: title, p_total: v, p_note: $("buyNote").value, p_proposal: purchaseDraft.proposal || null });
      if (error) throw error;
      await uploadPhoto(pid, buyPhoto());
      toast("Purchase recorded. Everyone has been notified.");
      ok = true;
      await loadFund();
    } catch (e) { toast(e.message || String(e)); }
    if (ok) { purchaseDraft = { title: "", total: "", note: "", proposal: "" }; history.replaceState(null, "", "admin.html#purchase"); renderPurchase(F.proposals.filter((p) => p.status === "approved")); }
  });
}

function willOweHtml() {
  const rows = F.members.map((m) => ({ m, fc: forecastFor(m.balance_fils) })).filter((x) => x.fc.after < 0);
  if (!rows.length) return "";
  return `<div class="sub-head">Members who'll owe after the next 30 days</div>` +
    rows.map(({ m, fc }) => `<div class="adm-row"><span class="adm-main"><b>${esc(m.name)}</b><span class="adm-sub">Now ${esc(balanceText(m.balance_fils))}</span></span><span class="owe-amt">needs ${jd(fc.topUp)}</span></div>`).join("");
}

/* ---------- members + desks ---------- */
function renderMembers() {
  renderFundPlan($("fundPlan"), { onDesk: openDeskAdmin });
  const free = FUND_PLAN.desks.filter((d) => !memberByDesk(d.id));
  $("membersHint").textContent = `${F.members.length} members · ${free.length} free desk${free.length === 1 ? "" : "s"} · tap a desk to manage it`;
  $("memberList").innerHTML = F.members.map((m) => {
    const d = FUND_PLAN.desks.find((x) => x.id === m.desk_id);
    return `<button class="adm-row link" data-desk="${m.desk_id}">
      <span class="adm-main"><b>${presenceDot(personByName(m.name))}${esc(m.name)}</b><span class="adm-sub">${esc(d?.label || "No desk")} · ${esc(lastSeenText(personByName(m.name)))}${m.pending_fils ? ` · ${jd(m.pending_fils)} waiting` : ""}</span></span>
      <span class="adm-bal ${balanceState(m.balance_fils)}">${esc(balanceText(m.balance_fils))}</span>
    </button>`;
  }).join("") || emptyBlock("No members yet. Tap a free desk on the plan to add someone.");
  $("memberList").querySelectorAll("[data-desk]").forEach((b) => b.addEventListener("click", () => openDeskAdmin(b.dataset.desk)));
}
function openDeskAdmin(deskId) {
  const d = FUND_PLAN.desks.find((x) => x.id === deskId);
  const m = memberByDesk(deskId);
  const freeDesks = FUND_PLAN.desks.filter((x) => !memberByDesk(x.id));
  if (!m) {
    const c = F.admin.candidates.filter((n) => !F.admins.includes(n));
    openSheet(`${d.label} is free`, "Add someone to the fund at this desk. They need to have created an account already. From then on, every split includes them.", `
      <div class="auth-fields">
        ${c.length ? `<select id="aUser" class="fld">${c.map((n) => `<option>${esc(n)}</option>`).join("")}</select>`
                   : `<div class="sheet-note">Everyone with an account is already in the fund.</div>`}
      </div>
      <div class="auth-err sheet-err"></div>
      <div class="modal-actions"><button class="btn ghost" id="aCancel">Keep it free</button>${c.length ? `<button class="btn primary" id="aAdd">Add to this desk</button>` : ""}</div>`,
      (el) => {
        el.querySelector("#aCancel").addEventListener("click", closeSheet);
        el.querySelector("#aAdd")?.addEventListener("click", async () => {
          const u = el.querySelector("#aUser").value;
          if (await callRpc("fund_add_member", { p_user: u, p_desk: deskId }, `${u} added`)) closeSheet();
        });
      });
    return;
  }
  openSheet(m.name, `${esc(d.label)} · ${esc(balanceText(m.balance_fils))}`, `
    <div class="auth-fields">
      ${freeDesks.length ? `<label class="fld-label">Move to
        <select id="mDesk" class="fld">${freeDesks.map((x) => `<option value="${x.id}">${esc(x.label)}</option>`).join("")}</select></label>`
        : `<div class="sheet-note">No free desk to move to.</div>`}
      <div class="sheet-note">${m.balance_fils === 0 ? "Their balance is 0 JD, so they can be taken out of the fund if this was a mistake." : "A member can only be taken out while their balance is exactly 0 JD."}</div>
    </div>
    <div class="auth-err sheet-err"></div>
    <div class="modal-actions">
      ${m.balance_fils === 0 ? `<button class="btn danger" id="mRemove">Remove</button>` : `<button class="btn ghost" id="mClose">Close</button>`}
      ${freeDesks.length ? `<button class="btn primary" id="mMove">Move desk</button>` : ""}
    </div>`,
    (el) => {
      el.querySelector("#mClose")?.addEventListener("click", closeSheet);
      el.querySelector("#mMove")?.addEventListener("click", async () => {
        if (await callRpc("fund_set_desk", { p_user: m.name, p_desk: el.querySelector("#mDesk").value }, "Desk changed")) closeSheet();
      });
      el.querySelector("#mRemove")?.addEventListener("click", async () => {
        if (!confirm(`Take ${m.name} out of the fund? Future splits won't include them.`)) return;
        if (await callRpc("fund_remove_member", { p_user: m.name }, `${m.name} removed`)) closeSheet();
      });
    });
}

/* ---------- history + reversals ---------- */
function renderEvents() {
  const ev = F.admin.events;
  const TYPE = { purchase: "Purchase", bill: "Bill", deposit: "Deposit" };
  $("eventList").innerHTML = ev.length ? ev.map((e) => `
    <div class="adm-row ${e.reversed ? "off" : ""}">
      <span class="adm-main"><b>${esc(e.label)}</b><span class="adm-sub">${TYPE[e.type]} · ${esc(fmtDate(e.at))}${e.reversed ? ` · reversed: ${esc(e.reason || "")}` : ""} ${photoLinks(e.ref)}
        ${photosFor(e.ref).length < 3 ? `<label class="photo-link add">${icon("clip")}Add photo<input type="file" accept="image/*" hidden data-addphoto="${e.ref}"></label>` : ""}</span></span>
      <span class="adm-amt">${jd(e.total_fils)}</span>
      ${e.reversed ? `<span class="pill">Reversed</span>` : `<button class="linkbtn" data-rev="${e.ref}">Reverse</button>`}
    </div>`).join("") : emptyBlock("Nothing yet.");
  wirePhotoLinks($("eventList"));
  $("eventList").querySelectorAll("[data-addphoto]").forEach((inp) => inp.addEventListener("change", async () => {
    if (!inp.files[0]) return;
    if (await uploadPhoto(inp.dataset.addphoto, inp.files[0])) { toast("Photo added"); loadFund(); }
  }));
  $("eventList").querySelectorAll("[data-rev]").forEach((b) => b.addEventListener("click", () => {
    const e = ev.find((x) => x.ref === b.dataset.rev);
    openSheet(`Reverse “${e.label}”?`, `${e.type === "deposit" ? "The deposit is taken back off their balance." : "Everyone gets their share back."} The original stays in the history, and everyone involved is notified.`, `
      <div class="auth-fields"><input id="vReason" class="fld" type="text" maxlength="160" placeholder="Reason, like: returned to the shop" /></div>
      <div class="auth-err sheet-err"></div>
      <div class="modal-actions"><button class="btn ghost" id="vCancel">Cancel</button><button class="btn danger" id="vGo">Reverse</button></div>`,
      (m) => {
        m.querySelector("#vCancel").addEventListener("click", closeSheet);
        m.querySelector("#vGo").addEventListener("click", async () => {
          const r = m.querySelector("#vReason").value.trim();
          if (!r) return sheetError(m, "Give a reason");
          if (await callRpc("fund_reverse", { p_ref: e.ref, p_reason: r }, "Reversed. Everyone involved was notified.")) closeSheet();
        });
      });
  }));
}

/* ---------- admin cash ---------- */
function renderCash() {
  const c = F.o?.cash;
  if (!c) { $("cashBody").innerHTML = emptyBlock("Not available."); return; }
  const owes = c.owes_admin > 0;
  $("cashBody").innerHTML = `
    <div class="cash-rows">
      <div><span>Members deposited (approved)</span><b>${jd(c.deposits_in)}</b></div>
      <div><span>You paid for the office (bills and purchases)</span><b>−${jdShort(c.paid_out)} JD</b></div>
    </div>
    <div class="cash-result ${owes ? "owed" : "ok"}">
      <span>${owes ? "The fund owes you" : "You should be holding"}</span><b>${jd(owes ? c.owes_admin : c.holding)}</b>
    </div>
    <div class="set-sub">${owes
      ? "You've paid more out of your own pocket than members have deposited. It's paid back automatically as members who owe make deposits. You get a reminder each week until it's even."
      : "This is the fund's money you're keeping for the office. It matches the Fund total."}</div>`;
}

/* ---------- backups ---------- */
function renderBackups() {
  const list = F.o?.backups || [];
  $("backupBody").innerHTML = `
    <button class="btn primary wide" id="bkNow">${icon("receipt")} Download everything now (.xlsx)</button>
    <div class="sub-head">Monthly copies</div>
    ${list.length ? list.map((b) => `<div class="adm-row"><span class="adm-main"><b>${esc(fmtMonth(b.period))}</b><span class="adm-sub">Saved ${esc(fmtDate(b.created_at))} · ${b.rows} money movements</span></span>
      <button class="linkbtn" data-bk="${b.period}">Download</button></div>`).join("") : emptyBlock("The first monthly copy is saved automatically.")}
    <div class="set-sub">Spreadsheets open in Excel, Google Sheets or Numbers. Keep a copy somewhere safe, like your email or Google Drive.</div>`;
  $("bkNow").addEventListener("click", async () => {
    const { data, error } = await sb.rpc("fund_export", { p_name: auth.name, p_pin: auth.pin });
    if (error) return toast(error.message);
    downloadBackup(data, new Date().toISOString().slice(0, 10));
  });
  $("backupBody").querySelectorAll("[data-bk]").forEach((b) => b.addEventListener("click", async () => {
    const { data, error } = await sb.rpc("fund_backup_get", { p_name: auth.name, p_pin: auth.pin, p_period: b.dataset.bk });
    if (error || !data) return toast(error?.message || "Backup not found");
    downloadBackup(data, b.dataset.bk.slice(0, 7));
  }));
}
function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    s.onload = () => res(window.XLSX); s.onerror = () => rej(new Error("Couldn't load the spreadsheet maker. Check your connection."));
    document.head.appendChild(s);
  });
}
async function downloadBackup(d, label) {
  try {
    const X = await loadXLSX();
    const J = (f) => (f == null ? null : Number(f) / 1000);
    const T = (iso) => (iso ? new Date(iso).toLocaleString("en-GB") : "");
    const sheets = {
      Members: d.members.map((m) => ({ Name: m.name, Role: m.role, Desk: m.desk || "", "Balance (JD)": J(m.balance_fils) })),
      Ledger: d.ledger.map((t) => ({ When: T(t.created_at), Member: t.user_name, "Amount (JD)": J(t.amount_fils), Kind: t.kind, Memo: t.memo, By: t.created_by || "" })),
      Deposits: d.deposits.map((x) => ({ Sent: T(x.created_at), Member: x.user_name, "Amount (JD)": J(x.amount_fils), Method: x.method, Note: x.note || "", Status: x.status, Reason: x.reason || "", Decided: T(x.decided_at), By: x.decided_by || "" })),
      Purchases: d.purchases.map((p) => ({ When: T(p.created_at), Item: p.title, "Total (JD)": J(p.total_fils), Note: p.note || "", By: p.created_by, Reversed: p.reversed_at ? T(p.reversed_at) + " – " + (p.reverse_reason || "") : "" })),
      Bills: d.bills.map((b) => ({ Bill: b.name, "Amount (JD)": b.amount_fils == null ? "changes monthly" : J(b.amount_fils), "Due day": b.due_day, Active: b.active ? "yes" : "no" })),
      "Bill charges": d.bill_charges.map((c) => ({ Month: c.period, Bill: (d.bills.find((b) => b.id === c.bill_id) || {}).name || "", "Charged (JD)": J(c.amount_fils), Status: c.status, Note: c.note || "", When: T(c.decided_at) })),
      Statements: d.statements.map((s) => ({ Month: s.period, Member: s.user_name, "Opening (JD)": J(s.opening_fils), "In (JD)": J(s.in_fils), "Out (JD)": J(s.out_fils), "Closing (JD)": J(s.closing_fils) })),
      Wishlist: d.proposals.map((p) => ({ Proposed: T(p.created_at), Item: p.title, "Price (JD)": J(p.price_fils), By: p.proposed_by, Status: p.status })),
      Summary: [{ "Members deposited (JD)": J(d.cash.deposits_in), "Paid for the office (JD)": J(d.cash.paid_out), "Fund holding (JD)": J(d.cash.holding), "Fund owes admin (JD)": J(d.cash.owes_admin), "Backup taken": T(d.taken_at) }],
    };
    const wb = X.utils.book_new();
    for (const [name, rows] of Object.entries(sheets)) {
      const ws = X.utils.json_to_sheet(rows.length ? rows : [{ Note: "Nothing yet" }]);
      ws["!cols"] = Object.keys(rows[0] || { Note: 1 }).map((k) => ({ wch: Math.max(10, Math.min(40, k.length + 4)) }));
      X.utils.book_append_sheet(wb, ws, name);
    }
    X.writeFile(wb, `the-office-backup-${label}.xlsx`);
    toast("Backup downloaded");
  } catch (e) { toast(e.message || String(e)); }
}
