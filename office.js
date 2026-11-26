/* ============================================================
   Office — who's in today (check in / out), chores rotation,
   meeting-room bookings.
   ============================================================ */
renderNav("office");

const $ = (id) => document.getElementById(id);

onFund = () => {
  renderToday();
  renderChores();
  renderMeeting();
  if (location.hash && !onFund.scrolled) { onFund.scrolled = true; setTimeout(() => document.querySelector(location.hash)?.scrollIntoView({ block: "start" }), 60); }
};

/* ---------- who's in today ---------- */
function renderToday() {
  const me = F.me.name;
  const mine = F.x.checkins.find((c) => c.name === me);
  const here = mine && !mine.out_at;
  const people = (F.people || []).slice().sort((a, b) => (inOffice(b.name) - inOffice(a.name)) || a.name.localeCompare(b.name));
  const inCount = people.filter((p) => inOffice(p.name)).length;
  $("todayHint").textContent = `${inCount} in the office`;
  $("todayBody").innerHTML = `
    <div class="checkin-box ${here ? "in" : ""}">
      <div>
        <div class="ci-state">${here ? "You're in the office" : mine ? "You left" : "You haven't checked in today"}</div>
        <div class="ci-sub">${here ? `Since ${esc(fmtTime(mine.in_at))}` : mine ? `Left at ${esc(fmtTime(mine.out_at))}` : "Let everyone know you're here."}</div>
      </div>
      <button class="btn ${here ? "ghost" : "primary"}" id="ciBtn">${here ? "I'm leaving" : "I'm in the office"}</button>
    </div>
    <div class="who-list">${people.map((p) => {
      const c = F.x.checkins.find((x) => x.name === p.name);
      const st = c && !c.out_at ? `In since ${fmtTime(c.in_at)}` : c ? `Left at ${fmtTime(c.out_at)}` : "Not in yet";
      return `<div class="who-row ${c && !c.out_at ? "in" : ""}"><span class="person-av sm" style="--h:${hashHue(p.name)}">${esc(initials(p.name))}</span>
        <span class="who-name">${esc(p.name)}${p.role === "admin" ? ` <span class="person-you">admin</span>` : ""}</span><span class="who-st">${esc(st)}</span></div>`;
    }).join("")}</div>`;
  $("ciBtn").addEventListener("click", () => callRpc("fund_checkin", { p_in: !here }, here ? "Checked out. See you!" : "Checked in"));
}

/* ---------- chores ---------- */
function renderChores() {
  const list = F.x.chores || [];
  const admin = isAdmin();
  $("choreAdd").hidden = !admin;
  $("choreList").innerHTML = list.length ? list.map((c) => {
    const mineTurn = c.assignee === F.me.name;
    return `<div class="chore-card ${c.done_at ? "done" : ""} ${mineTurn ? "mine" : ""}">
      <div class="chore-top"><div class="chore-ico">${icon("sweep")}</div>
        <div><div class="chore-name">${esc(c.name)}</div><div class="chore-sub">Every ${c.every_days === 1 ? "day" : c.every_days === 7 ? "week" : c.every_days + " days"}</div></div></div>
      <div class="chore-turn"><span>${mineTurn ? "Your turn" : `${esc(c.assignee)}'s turn`}</span><b>until ${esc(fmtDay(c.period_end))}</b></div>
      <div class="chore-next">Next: ${esc(c.next || "—")}</div>
      <div class="chore-act">${c.done_at
        ? `<span class="pill good">Done by ${esc(c.done_by)}</span><button class="linkbtn" data-undo="${c.id}">Undo</button>`
        : `<button class="btn ${mineTurn ? "primary" : "ghost"} small" data-done="${c.id}">${icon("check")} Mark done</button>`}
        ${admin ? `<button class="linkbtn" data-edit="${c.id}">Edit</button>` : ""}</div>
    </div>`;
  }).join("") : emptyBlock(admin ? "No chores yet. Add one, like kitchen cleaning every week." : "No chores yet. The admin can add them.");
  $("choreList").querySelectorAll("[data-done]").forEach((b) => b.addEventListener("click", () => callRpc("fund_chore_done", { p_chore: b.dataset.done, p_done: true }, "Marked done. Thanks!")));
  $("choreList").querySelectorAll("[data-undo]").forEach((b) => b.addEventListener("click", () => callRpc("fund_chore_done", { p_chore: b.dataset.undo, p_done: false }, "Marked not done")));
  $("choreList").querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => openChore((F.x.all_chores || []).find((c) => c.id === b.dataset.edit))));
  if (admin) {
    const paused = (F.x.all_chores || []).filter((c) => !c.active);
    $("chorePaused").innerHTML = paused.length ? `<div class="sub-head">Paused</div>` + paused.map((c) => `<button class="adm-row link off" data-pedit="${c.id}"><span class="adm-main"><b>${esc(c.name)}</b></span><span class="adm-edit">Edit</span></button>`).join("") : "";
    $("chorePaused").querySelectorAll("[data-pedit]").forEach((b) => b.addEventListener("click", () => openChore(F.x.all_chores.find((c) => c.id === b.dataset.pedit))));
  }
}
$("choreAdd").addEventListener("click", () => openChore(null));
function openChore(c) {
  openSheet(c ? `Edit ${c.name}` : "New chore", "It rotates between the six members in name order. Whoever's turn it is gets a reminder.", `
    <div class="auth-fields">
      <input id="chName" class="fld" type="text" maxlength="60" placeholder="Kitchen cleaning" value="${esc(c?.name || "")}" />
      <label class="fld-label">Repeats every
        <select id="chEvery" class="fld">${[[1, "Day"], [2, "2 days"], [3, "3 days"], [7, "Week"], [14, "2 weeks"], [30, "Month (30 days)"]].map(([v, l]) => `<option value="${v}" ${v === (c?.every_days || 7) ? "selected" : ""}>${l}</option>`).join("")}</select>
      </label>
      ${c ? `<label class="check"><input type="checkbox" id="chActive" ${c.active !== false ? "checked" : ""}/> Active</label>` : ""}
    </div>
    <div class="auth-err sheet-err"></div>
    <div class="modal-actions"><button class="btn ghost" id="chCancel">Cancel</button><button class="btn primary" id="chSave">Save</button></div>`,
    (m) => {
      m.querySelector("#chCancel").addEventListener("click", closeSheet);
      m.querySelector("#chSave").addEventListener("click", async () => {
        const name = m.querySelector("#chName").value.trim();
        if (!name) return sheetError(m, "Name the chore");
        const ok = await callRpc("fund_save_chore", { p_id: c?.id || null, p_chore: name, p_every: Number(m.querySelector("#chEvery").value), p_active: c ? m.querySelector("#chActive").checked : true }, "Chore saved");
        if (ok) closeSheet();
      });
    });
}

/* ---------- meeting room ---------- */
function pad(n) { return String(n).padStart(2, "0"); }
function localDate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function renderMeeting() {
  const st = meetingStatus();
  $("mrStatus").innerHTML = `<div class="mr-state ${st.busy ? "busy" : "free"}"><span class="mr-dot"></span><div><b>${st.busy ? "Busy now" : "Free now"}</b><div class="mr-line">${esc(st.line)}</div></div></div>`;
  const now = new Date();
  const start = new Date(now); start.setMinutes(now.getMinutes() < 30 ? 30 : 60, 0, 0);
  const end = new Date(start.getTime() + 60 * 60000);
  if (!$("mrDate").value) {
    $("mrDate").value = localDate(start); $("mrDate").min = localDate(now);
    $("mrStart").value = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
    $("mrEnd").value = `${pad(end.getHours())}:${pad(end.getMinutes())}`;
  }
  const list = (F.x.bookings || []).filter((b) => new Date(b.ends_at) > now);
  let html = "", lastDay = "";
  for (const b of list) {
    const day = fmtDay(b.starts_at);
    if (day !== lastDay) { html += `<div class="bk-day">${esc(new Date(b.starts_at).toDateString() === now.toDateString() ? "Today" : day)}</div>`; lastDay = day; }
    const live = new Date(b.starts_at) <= now;
    const canCancel = b.user_name === F.me.name || isAdmin();
    html += `<div class="bk-row ${live ? "live" : ""}"><span class="bk-time">${esc(fmtTime(b.starts_at))} – ${esc(fmtTime(b.ends_at))}</span>
      <span class="bk-main"><b>${esc(b.title || "Meeting")}</b><span>${esc(b.user_name)}</span></span>
      ${canCancel ? `<button class="linkbtn" data-cancel="${b.id}">Cancel</button>` : ""}</div>`;
  }
  $("mrList").innerHTML = html || emptyBlock("No bookings coming up.");
  $("mrList").querySelectorAll("[data-cancel]").forEach((b) => b.addEventListener("click", () => {
    if (confirm("Cancel this booking?")) callRpc("fund_cancel_booking", { p_id: b.dataset.cancel }, "Booking cancelled");
  }));
}
$("mrForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const d = $("mrDate").value, s = $("mrStart").value, t = $("mrEnd").value;
  if (!d || !s || !t) return toast("Pick a date and times");
  const startAt = new Date(`${d}T${s}`), endAt = new Date(`${d}T${t}`);
  if (endAt <= startAt && t < s) endAt.setDate(endAt.getDate() + 1);  // runs past midnight
  if (endAt <= startAt) return toast("The end time must be after the start time");
  const ok = await callRpc("fund_book", { p_title: $("mrTitle").value, p_start: startAt.toISOString(), p_end: endAt.toISOString() }, "Meeting room booked");
  if (ok) $("mrTitle").value = "";
});
