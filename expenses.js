/* ============================================================
   Expenses — monthly bills (charged only after the admin confirms)
   and the wishlist (passes only if every member votes yes; one "no",
   with a reason, rejects it; anything closed can be proposed again).
   ============================================================ */
renderNav("expenses");

const $ = (id) => document.getElementById(id);
const STATUS_TEXT = { open: "Voting", approved: "Approved", rejected: "Rejected", expired: "Not approved", withdrawn: "Withdrawn", bought: "Bought" };

onFund = () => {
  $("statMonthly").textContent = jd(F.monthly_fils);
  $("statVotes").textContent = String(F.proposals.filter((p) => p.status === "open").length);
  renderBills();
  renderWishlist();
  if (location.hash && !onFund.scrolled) { onFund.scrolled = true; setTimeout(() => document.querySelector(location.hash)?.scrollIntoView({ block: "start" }), 50); }
};
$("proposeBtn").addEventListener("click", () => openPropose());

/* ---------- monthly bills ---------- */
function renderBills() {
  const n = Math.max(1, memberCount());
  const period = F.today.slice(0, 8) + "01";
  const day = Number(F.today.slice(8, 10));
  $("billsHint").textContent = `Split between ${n} member${n === 1 ? "" : "s"} · nothing is charged until the admin confirms`;
  const bills = F.bills.filter((b) => b.active);
  if (!bills.length) { $("billList").innerHTML = emptyBlock("No monthly bills yet. The admin adds them from the admin panel."); return; }
  $("billList").innerHTML = bills.map((b) => {
    const charges = F.charges.filter((c) => c.bill_id === b.id);
    const cur = charges.find((c) => c.period === period);
    let status;
    if (cur?.status === "charged") status = `<span class="pill good">Charged ${jdShort(cur.amount_fils)}</span>`;
    else if (cur?.status === "due") status = `<span class="pill warn">Waiting for admin</span>`;
    else if (cur?.status === "skipped") status = `<span class="pill">Skipped this month</span>`;
    else if (cur?.status === "reversed") status = `<span class="pill">Reversed</span>`;
    else if (b.due_day > day) status = `<span class="pill">Due ${esc(fmtDay(period.slice(0, 8) + String(b.due_day).padStart(2, "0")))}</span>`;
    else status = `<span class="pill">Next month</span>`;
    const amt = b.amount_fils != null ? jd(b.amount_fils)
      : b.estimate_fils != null ? `Changes monthly · about ${jd(b.estimate_fils)}` : "Changes monthly";
    const base = b.amount_fils ?? b.estimate_fils;
    const each = base != null ? `${b.amount_fils == null || base % n ? "≈ " : ""}${jd(Math.ceil(base / n))} each` : "";
    const hist = charges.filter((c) => c.status === "charged" && c.period !== period).slice(0, 6)
      .map((c) => `<span class="bill-h">${esc(fmtMonth(c.period).split(" ")[0].slice(0, 3))} ${jdShort(c.amount_fils)}</span>`).join("");
    return `<div class="bill-row">
      <div class="bill-ico">${icon("calendar")}</div>
      <div class="bill-main">
        <div class="bill-name">${esc(b.name)} <span class="bill-day">· day ${b.due_day}</span></div>
        <div class="bill-sub">${esc(amt)}${each ? " · " + esc(each) : ""}</div>
        ${hist ? `<div class="bill-hist">${hist}</div>` : ""}
      </div>
      <div class="bill-status">${status}</div>
    </div>`;
  }).join("");
}

/* ---------- wishlist ---------- */
function voteBar(p) {
  const votes = new Map(p.votes.map((v) => [v.voter, v]));
  return `<div class="vote-bar" aria-label="${p.votes.filter((v) => v.approve).length} of ${F.members.length} yes">
    ${F.members.map((m) => {
      const v = votes.get(m.name);
      const cls = !v ? "wait" : v.approve ? "yes" : "no";
      return `<span class="vote-pip ${cls}" title="${esc(m.name)}: ${!v ? "hasn't voted" : v.approve ? "yes" : "no"}"></span>`;
    }).join("")}
  </div>`;
}
function wishCard(p) {
  const n = Math.max(1, memberCount());
  const yes = p.votes.filter((v) => v.approve).length;
  const myVote = p.votes.find((v) => v.voter === F.me.name);
  const waiting = F.members.filter((m) => !p.votes.some((v) => v.voter === m.name)).map((m) => m.name);
  const no = p.votes.find((v) => !v.approve);
  const parent = p.parent_id ? F.proposals.find((x) => x.id === p.parent_id) : null;
  let foot = "", actions = "";

  if (p.status === "open") {
    foot = `${yes} of ${n} yes · ${waiting.length ? `waiting on ${esc(waiting.join(", "))}` : "everyone voted"} · ${esc(timeLeft(p.deadline))}`;
    if (F.me.role === "member") {
      actions = myVote?.approve
        ? `<span class="you-voted">You said yes</span><button class="btn ghost small" data-no="${p.id}">Change to no</button>`
        : `<button class="btn ghost small" data-no="${p.id}">${icon("x")} No</button><button class="btn primary small" data-yes="${p.id}">${icon("check")} Yes</button>`;
    }
    if (p.proposed_by === F.me.name || isAdmin()) actions = `<button class="linkbtn" data-withdraw="${p.id}">Withdraw</button>` + actions;
  } else if (p.status === "approved") {
    foot = `All ${n} said yes · ${esc(fmtDate(p.closed_at))}`;
    actions = isAdmin() ? `<a class="btn primary small" href="admin.html?buy=${p.id}#purchase">Record purchase</a>` : `<span class="you-voted">Waiting for the admin to buy it</span>`;
  } else if (p.status === "rejected") {
    foot = no ? `${esc(no.voter)} said no: “${esc(no.comment || "")}”` : "Rejected";
  } else if (p.status === "expired") {
    foot = `The vote closed with ${yes} of ${n} yes. Everyone has to agree.`;
  } else if (p.status === "withdrawn") {
    foot = "Withdrawn";
  } else if (p.status === "bought") {
    foot = `Bought · ${esc(fmtDate(p.closed_at))}`;
  }
  if (["rejected", "expired", "withdrawn"].includes(p.status) && !F.proposals.some((x) => x.parent_id === p.id)) {
    actions = `<button class="btn ghost small" data-again="${p.id}">Propose again</button>`;
  }
  return `<article class="wish-card s-${p.status}">
    <div class="wish-top">
      <div>
        <div class="wish-title">${esc(p.title)}</div>
        <div class="wish-meta">${esc(p.proposed_by)} · ${esc(relShort(p.created_at))} ago${parent ? ` · changed from “${esc(parent.title)}”` : ""}</div>
      </div>
      <div class="wish-price">${jd(p.price_fils)}<span>≈ ${jdShort(Math.ceil(p.price_fils / n))} each</span></div>
    </div>
    ${p.reason ? `<div class="wish-reason">${esc(p.reason)}</div>` : ""}
    ${p.link ? `<a class="wish-link" href="${esc(/^https?:\/\//i.test(p.link) ? p.link : "https://" + p.link)}" target="_blank" rel="noopener noreferrer">View the item ↗</a>` : ""}
    ${voteBar(p)}
    <div class="wish-foot"><span class="pill ${p.status === "approved" || p.status === "bought" ? "good" : p.status === "open" ? "" : "bad"}">${STATUS_TEXT[p.status]}</span><span class="wish-foot-t">${foot}</span></div>
    ${actions ? `<div class="wish-actions">${actions}</div>` : ""}
  </article>`;
}
function renderWishlist() {
  const by = (st) => F.proposals.filter((p) => st.includes(p.status));
  const fill = (el, list, empty) => { $(el).innerHTML = list.length ? list.map(wishCard).join("") : emptyBlock(empty); };
  fill("wishOpen", by(["open"]), "Nothing up for a vote. Propose something the office needs.");
  fill("wishApproved", by(["approved"]), "Nothing waiting to be bought.");
  fill("wishClosed", by(["rejected", "expired", "withdrawn", "bought"]).slice(0, 30), "Nothing closed yet.");
  const root = $("wishlist");
  root.querySelectorAll("[data-yes]").forEach((b) => b.addEventListener("click", () => vote(b.dataset.yes, true)));
  root.querySelectorAll("[data-no]").forEach((b) => b.addEventListener("click", () => openNo(b.dataset.no)));
  root.querySelectorAll("[data-withdraw]").forEach((b) => b.addEventListener("click", () => {
    if (confirm("Withdraw this item? Voting stops.")) callRpc("fund_withdraw_proposal", { p_id: b.dataset.withdraw }, "Withdrawn");
  }));
  root.querySelectorAll("[data-again]").forEach((b) => b.addEventListener("click", () => openPropose(F.proposals.find((p) => p.id === b.dataset.again))));
}
async function vote(id, yes, comment) {
  const p = F.proposals.find((x) => x.id === id);
  return callRpc("fund_vote", { p_id: id, p_approve: yes, p_comment: comment || null },
    yes ? (p && p.votes.filter((v) => v.approve && v.voter !== F.me.name).length + 1 >= memberCount() ? "Approved by everyone" : "Voted yes") : "Voted no. The item is rejected.");
}
function openNo(id) {
  const p = F.proposals.find((x) => x.id === id);
  openSheet(`Vote no on “${p.title}”`, "One no rejects it. Say why, so it can be changed and proposed again.", `
    <div class="auth-fields"><textarea id="nReason" class="fld note" rows="3" maxlength="240" placeholder="Too expensive, find one under 80 JD"></textarea></div>
    <div class="auth-err sheet-err"></div>
    <div class="modal-actions"><button class="btn ghost" id="nCancel">Cancel</button><button class="btn danger" id="nSend">Vote no</button></div>`,
    (m) => {
      m.querySelector("#nCancel").addEventListener("click", closeSheet);
      m.querySelector("#nSend").addEventListener("click", async () => {
        const r = m.querySelector("#nReason").value.trim();
        if (r.length < 3) return sheetError(m, "Write a short reason");
        if (await vote(id, false, r)) closeSheet();
      });
    });
}
function openPropose(parent) {
  openSheet(parent ? "Propose it again" : "Propose something to buy",
    parent ? `Change what didn't work${parent.votes.find((v) => !v.approve) ? ` (${esc(parent.votes.find((v) => !v.approve).comment || "")})` : ""} and start a new vote.`
           : "Everyone gets notified. It's bought only if all members say yes.", `
    <div class="auth-fields">
      <input id="pTitle" class="fld" type="text" maxlength="120" placeholder="Coffee machine" value="${esc(parent?.title || "")}" />
      <input id="pPrice" class="fld" type="text" inputmode="decimal" placeholder="Price in JD, like 79.5" value="${parent ? esc(jdShort(parent.price_fils)) : ""}" />
      <input id="pLink" class="fld" type="url" placeholder="Link (optional)" value="${esc(parent?.link || "")}" />
      <textarea id="pReason" class="fld note" rows="2" maxlength="300" placeholder="Why we need it (optional)">${esc(parent?.reason || "")}</textarea>
      <label class="fld-label">Voting time
        <select id="pDays" class="fld">${[1, 2, 3, 5, 7].map((d) => `<option value="${d}" ${d === 3 ? "selected" : ""}>${d} day${d === 1 ? "" : "s"}</option>`).join("")}</select>
      </label>
      <div class="sheet-note" id="pEach"></div>
    </div>
    <div class="auth-err sheet-err"></div>
    <div class="modal-actions"><button class="btn ghost" id="pCancel">Cancel</button><button class="btn primary" id="pSend">Start the vote</button></div>`,
    (m) => {
      const each = () => {
        const v = parseJD(m.querySelector("#pPrice").value);
        m.querySelector("#pEach").textContent = v ? `About ${jd(Math.ceil(v * 1000 / Math.max(1, memberCount())))} each if it passes.` : "";
      };
      m.querySelector("#pPrice").addEventListener("input", each); each();
      m.querySelector("#pCancel").addEventListener("click", closeSheet);
      m.querySelector("#pSend").addEventListener("click", async () => {
        const title = m.querySelector("#pTitle").value.trim();
        const price = parseJD(m.querySelector("#pPrice").value);
        if (!title) return sheetError(m, "Say what you want to buy");
        if (!price) return sheetError(m, "Enter a price in JD, up to 3 decimals");
        const ok = await callRpc("fund_propose", {
          p_title: title, p_price: price, p_link: m.querySelector("#pLink").value, p_reason: m.querySelector("#pReason").value,
          p_days: Number(m.querySelector("#pDays").value), p_parent: parent?.id || null,
        }, "Vote started. Everyone's been notified.");
        if (ok) closeSheet();
      });
    });
}
