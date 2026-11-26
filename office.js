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
  renderCalendar();
  renderInfo();
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

/* ---------- calendar ---------- */
const KIND = { event: "Event", holiday: "Holiday", day_off: "Day off", closed: "Office closed" };
let calMonth = (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })();
function eventsOn(day) { return (F.o.events || []).filter((e) => e.starts_on <= day && e.ends_on >= day); }
function renderCalendar() {
  const y = calMonth.getFullYear(), mo = calMonth.getMonth();
  $("calTitle").textContent = calMonth.toLocaleDateString([], { month: "long", year: "numeric" });
  const first = new Date(y, mo, 1), startDow = (first.getDay() + 1) % 7; // weeks start on Saturday
  const days = new Date(y, mo + 1, 0).getDate();
  const today = localDate(new Date());
  const heads = [6, 0, 1, 2, 3, 4, 5].map((d) => new Date(2023, 0, 1 + d).toLocaleDateString([], { weekday: "short" }));
  let cells = heads.map((h) => `<div class="cal-h">${esc(h)}</div>`).join("");
  for (let i = 0; i < startDow; i++) cells += `<div class="cal-d empty"></div>`;
  for (let d = 1; d <= days; d++) {
    const key = `${y}-${pad(mo + 1)}-${pad(d)}`;
    const ev = eventsOn(key);
    cells += `<button type="button" class="cal-d ${key === today ? "today" : ""} ${ev.length ? "has" : ""}" data-day="${key}">
      <span class="cal-n">${d}</span><span class="cal-dots">${ev.slice(0, 3).map((e) => `<i class="ev-dot k-${e.kind}"></i>`).join("")}</span>
      ${ev[0] ? `<span class="cal-t">${esc(ev[0].title)}${ev.length > 1 ? ` +${ev.length - 1}` : ""}</span>` : ""}</button>`;
  }
  $("calGrid").innerHTML = cells;
  $("calGrid").querySelectorAll("[data-day]").forEach((b) => b.addEventListener("click", () => openDay(b.dataset.day)));
  const up = (F.o.events || []).filter((e) => e.ends_on >= today).slice(0, 12);
  $("calList").innerHTML = up.length ? up.map((e) => `<button type="button" class="ev-row" data-ev="${e.id}"><i class="ev-dot k-${e.kind}"></i>
      <span class="ev-main"><b>${esc(e.title)}</b><span>${esc(rangeText(e))} · ${esc(KIND[e.kind])}</span></span></button>`).join("")
    : emptyBlock("Nothing coming up. Add holidays, days off and office events.");
  $("calList").querySelectorAll("[data-ev]").forEach((b) => b.addEventListener("click", () => openEvent(F.o.events.find((e) => e.id === b.dataset.ev))));
}
function rangeText(e) { return e.starts_on === e.ends_on ? fmtDay(e.starts_on) : `${fmtDay(e.starts_on)} – ${fmtDay(e.ends_on)}`; }
$("calPrev").addEventListener("click", () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); renderCalendar(); });
$("calNext").addEventListener("click", () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); renderCalendar(); });
$("evAdd").addEventListener("click", () => openEvent(null));
function openDay(day) {
  const ev = eventsOn(day);
  if (!ev.length) return openEvent(null, day);
  openSheet(fmtDay(day), "", `<div class="ev-day">${ev.map((e) => `<button type="button" class="ev-row" data-ev="${e.id}"><i class="ev-dot k-${e.kind}"></i>
      <span class="ev-main"><b>${esc(e.title)}</b><span>${esc(rangeText(e))} · ${esc(KIND[e.kind])} · ${esc(e.created_by)}</span>${e.note ? `<span>${esc(e.note)}</span>` : ""}</span></button>`).join("")}</div>
    <div class="modal-actions"><button class="btn ghost" id="dClose">Close</button><button class="btn primary" id="dAdd">Add on this day</button></div>`,
    (m) => {
      m.querySelector("#dClose").addEventListener("click", closeSheet);
      m.querySelector("#dAdd").addEventListener("click", () => openEvent(null, day));
      m.querySelectorAll("[data-ev]").forEach((b) => b.addEventListener("click", () => openEvent(F.o.events.find((e) => e.id === b.dataset.ev))));
    });
}
function openEvent(e, day) {
  const mine = !e || e.created_by === F.me.name || isAdmin();
  const d0 = e?.starts_on || day || localDate(new Date());
  openSheet(e ? (mine ? "Edit" : e.title) : "Add to calendar", e ? `Added by ${esc(e.created_by)}` : "Everyone gets notified.", `
    <div class="auth-fields">
      <div class="seg" id="evKind">${Object.entries(KIND).map(([k, l]) => `<button type="button" class="seg-btn ${(e?.kind || "event") === k ? "on" : ""}" data-k="${k}" ${mine ? "" : "disabled"}>${l}</button>`).join("")}</div>
      <input id="evTitle" class="fld" type="text" maxlength="120" placeholder="Title (for a day off, leave empty)" value="${esc(e?.title || "")}" ${mine ? "" : "disabled"} />
      <div class="two-col"><label class="fld-label">From<input id="evStart" class="fld" type="date" value="${d0}" ${mine ? "" : "disabled"} /></label>
        <label class="fld-label">To<input id="evEnd" class="fld" type="date" value="${e?.ends_on || d0}" ${mine ? "" : "disabled"} /></label></div>
      <input id="evNote" class="fld" type="text" maxlength="200" placeholder="Note (optional)" value="${esc(e?.note || "")}" ${mine ? "" : "disabled"} />
    </div>
    <div class="auth-err sheet-err"></div>
    <div class="modal-actions">${e && mine ? `<button class="btn danger" id="evDel">Remove</button>` : `<button class="btn ghost" id="evCancel">${mine ? "Cancel" : "Close"}</button>`}
      ${mine ? `<button class="btn primary" id="evSave">Save</button>` : ""}</div>`,
    (m) => {
      let kind = e?.kind || "event";
      m.querySelectorAll("[data-k]").forEach((b) => b.addEventListener("click", () => { kind = b.dataset.k; m.querySelectorAll("[data-k]").forEach((x) => x.classList.toggle("on", x === b)); }));
      m.querySelector("#evCancel")?.addEventListener("click", closeSheet);
      m.querySelector("#evStart")?.addEventListener("change", (ev) => { const end = m.querySelector("#evEnd"); if (end.value < ev.target.value) end.value = ev.target.value; });
      m.querySelector("#evDel")?.addEventListener("click", async () => {
        if (!confirm("Remove this from the calendar?")) return;
        if (await callRpc("fund_event_delete", { p_id: e.id }, "Removed from the calendar")) closeSheet();
      });
      m.querySelector("#evSave")?.addEventListener("click", async () => {
        const ok = await callRpc("fund_event_save", { p_id: e?.id || null, p_title: m.querySelector("#evTitle").value, p_kind: kind,
          p_start: m.querySelector("#evStart").value, p_end: m.querySelector("#evEnd").value, p_note: m.querySelector("#evNote").value }, e ? "Saved" : "Added. Everyone has been notified.");
        if (ok) closeSheet();
      });
    });
}

/* ---------- office info (Wi-Fi, door codes...) ---------- */
function renderInfo() {
  const list = F.o.info || [];
  $("infoAdd").hidden = !isAdmin();
  $("infoList").innerHTML = list.length ? list.map((i) => `<div class="info-card">
      <div class="info-title">${esc(i.title)}</div>
      <div class="info-val"><code class="masked" data-val="${i.id}">••••••••</code>
        <button type="button" class="linkbtn" data-show="${i.id}">Show</button><button type="button" class="linkbtn" data-copy="${i.id}">Copy</button>
        ${isAdmin() ? `<button type="button" class="linkbtn" data-iedit="${i.id}">Edit</button>` : ""}</div>
      ${i.note ? `<div class="info-note">${esc(i.note)}</div>` : ""}
    </div>`).join("") : emptyBlock(isAdmin() ? "Add the Wi-Fi password, door code, building contacts and so on. Only the fund members can see them." : "Nothing here yet. The admin can add the Wi-Fi password, door code and so on.");
  const byId = (id) => list.find((x) => x.id === id);
  $("infoList").querySelectorAll("[data-show]").forEach((b) => b.addEventListener("click", () => {
    const c = $("infoList").querySelector(`[data-val="${b.dataset.show}"]`);
    const shown = c.classList.toggle("shown");
    c.textContent = shown ? byId(b.dataset.show).value : "••••••••";
    b.textContent = shown ? "Hide" : "Show";
  }));
  $("infoList").querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(byId(b.dataset.copy).value); toast("Copied"); } catch { toast("Couldn't copy. Tap Show and copy it by hand."); }
  }));
  $("infoList").querySelectorAll("[data-iedit]").forEach((b) => b.addEventListener("click", () => openInfo(byId(b.dataset.iedit))));
}
$("infoAdd").addEventListener("click", () => openInfo(null));
function openInfo(i) {
  openSheet(i ? `Edit ${i.title}` : "Add office info", "Only the six members and the admin can see this.", `
    <div class="auth-fields">
      <input id="inTitle" class="fld" type="text" maxlength="80" placeholder="Title, like Wi-Fi password" value="${esc(i?.title || "")}" />
      <input id="inValue" class="fld" type="text" maxlength="500" placeholder="Value" value="${esc(i?.value || "")}" />
      <input id="inNote" class="fld" type="text" maxlength="200" placeholder="Note (optional), like the network name" value="${esc(i?.note || "")}" />
    </div>
    <div class="auth-err sheet-err"></div>
    <div class="modal-actions">${i ? `<button class="btn danger" id="inDel">Remove</button>` : `<button class="btn ghost" id="inCancel">Cancel</button>`}<button class="btn primary" id="inSave">Save</button></div>`,
    (m) => {
      m.querySelector("#inCancel")?.addEventListener("click", closeSheet);
      m.querySelector("#inDel")?.addEventListener("click", async () => { if (confirm("Remove this?") && await callRpc("fund_info_delete", { p_id: i.id }, "Removed")) closeSheet(); });
      m.querySelector("#inSave").addEventListener("click", async () => {
        const ok = await callRpc("fund_info_save", { p_id: i?.id || null, p_title: m.querySelector("#inTitle").value, p_value: m.querySelector("#inValue").value,
          p_note: m.querySelector("#inNote").value, p_sort: i?.sort ?? (F.o.info || []).length }, "Saved");
        if (ok) closeSheet();
      });
    });
}
