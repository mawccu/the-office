/* ============================================================
   The Office — office fund shared code (fund, expenses, admin pages).

   Load order:  supabase.js -> config.js -> core.js -> fund-core.js -> <page>.js

   Money arrives from the database in FILS (1 JD = 1000 fils), always as
   whole numbers, so nothing here ever does floating-point money maths
   except to display it.

   A page sets:
     onFund(F)      — render everything from the dashboard payload F
     gateEl         — element to show "sign in" / "not in the fund" in
   ============================================================ */

let F = null;                  // latest fund_dashboard payload
let onFund = () => {};
let fundLoading = false;

// ---- money ----
function jd(fils) {
  const f = Math.round(Number(fils) || 0);
  const neg = f < 0, a = Math.abs(f);
  return `${neg ? "−" : ""}${Math.floor(a / 1000)}.${String(a % 1000).padStart(3, "0")} JD`;
}
function jdSigned(fils) { const f = Math.round(Number(fils) || 0); return (f > 0 ? "+" : "") + jd(f); }
function jdShort(fils) { return jd(fils).replace(" JD", ""); }
// what a person types ("16.5") -> number of JD (validated), or null
function parseJD(v) {
  const s = String(v ?? "").trim().replace(",", ".");
  if (!/^\d+(\.\d{1,3})?$/.test(s)) return null;
  const n = Number(s);
  return n > 0 ? n : null;
}
function balanceState(fils) { return fils < 0 ? "owed" : fils < 10000 ? "low" : "ok"; }   // under 10 JD = low
function balanceText(fils) { return fils < 0 ? `Owes ${jd(-fils)}` : jd(fils); }

// ---- dates ----
function fmtDay(d) {
  if (!d) return "";
  const x = typeof d === "string" && d.length === 10 ? new Date(d + "T00:00:00") : new Date(d);
  return x.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
}
function fmtMonth(d) {
  const x = typeof d === "string" && d.length === 10 ? new Date(d + "T00:00:00") : new Date(d);
  return x.toLocaleDateString([], { month: "long", year: "numeric" });
}
function timeLeft(iso) {
  const ms = new Date(iso) - Date.now();
  if (ms <= 0) return "closing now";
  const h = Math.floor(ms / 3600000), d = Math.floor(h / 24);
  return d >= 2 ? `${d} days left` : h >= 1 ? `${h}h left` : `${Math.max(1, Math.round(ms / 60000))}m left`;
}
const METHOD_LABEL = { cash: "Cash", cliq: "CliQ", bank: "Bank transfer", other: "Other" };

// ---- loading ----
function fundGate(html) {
  const g = document.getElementById("fundGate");
  const body = document.getElementById("fundBody");
  if (g) { g.innerHTML = html || ""; g.hidden = !html; }
  if (body) body.hidden = !!html;
}
async function loadFund() {
  if (!auth) {
    F = null;
    fundGate(`<div class="composer-empty"><div class="ce-title">Log in to see the office fund</div>
      <div class="ce-sub">Balances, deposits and shared bills are only visible to the six members and the admin.</div>
      <button class="btn primary" id="gateLogin">Log in</button></div>`);
    document.getElementById("gateLogin")?.addEventListener("click", () => openAuth("login"));
    return;
  }
  if (fundLoading) return;
  fundLoading = true;
  try {
    const { data, error } = await sb.rpc("fund_dashboard", { p_name: auth.name, p_pin: auth.pin });
    if (error) throw error;
    F = data;
    const [pr, ex] = await Promise.all([
      sb.rpc("fund_people", { p_name: auth.name, p_pin: auth.pin }),
      sb.rpc("fund_extras", { p_name: auth.name, p_pin: auth.pin }),
    ]);
    F.people = pr.error ? [] : (pr.data || []);
    F.x = ex.error ? { attachments: [], checkins: [], chores: [], bookings: [], settings: {} } : ex.data;
    localStorage.setItem("fund_role", F.me.role);
    renderNav();
    setBell(F.unread);
    fundGate("");
    onFund(F);
  } catch (e) {
    const msg = e.message || String(e);
    F = null;
    if (/not in the office fund/i.test(msg)) {
      localStorage.removeItem("fund_role"); renderNav();
      fundGate(`<div class="composer-empty"><div class="ce-title">You're not in the office fund yet</div>
        <div class="ce-sub">Ask the admin to add <b>${esc(auth.name)}</b> and give you a desk. Then this page shows your balance.</div></div>`);
    } else if (/could not find the function|does not exist/i.test(msg)) {
      fundGate(`<div class="composer-empty"><div class="ce-title">The fund isn't set up yet</div>
        <div class="ce-sub">Run <b>finance.sql</b> in the Supabase SQL editor, then reload.</div></div>`);
    } else if (/wrong username or password/i.test(msg)) {
      clearAuth(); openAuth("login");
    } else {
      fundGate(`<div class="composer-empty"><div class="ce-title">Couldn't load the fund</div><div class="ce-sub">${esc(msg)}</div></div>`);
    }
  } finally {
    fundLoading = false;
  }
}
afterWrite = loadFund;
onAuthChange = loadFund;
setInterval(() => { if (auth && !document.hidden && !document.querySelector(".overlay.open")) loadFund(); }, 60000);

// ---- presence: "Active now" / "Last active 3h ago" ----
function personByName(n) { return F?.people?.find((p) => p.name === n) || null; }
function lastSeenText(p) {
  if (!p || !p.last_seen_at) return "Hasn't signed in yet";
  if (p.active) return "Active now";
  const d = new Date(p.last_seen_at), mins = (Date.now() - d) / 60000;
  if (mins < 60 * 24 * 2) return `Last active ${relShort(p.last_seen_at)} ago`;
  return `Last active ${d.toLocaleDateString([], { day: "numeric", month: "short" })}`;
}
function presenceDot(p) { return `<span class="pres-dot ${p?.active ? "on" : ""}" aria-hidden="true"></span>`; }

function inOffice(name) { const c = F?.x?.checkins?.find((x) => x.name === name); return !!(c && !c.out_at); }
function fmtTime(iso) { return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }
function meetingStatus() {
  const now = Date.now();
  const list = (F?.x?.bookings || []).filter((b) => new Date(b.ends_at) > now).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  const cur = list.find((b) => new Date(b.starts_at) <= now);
  const next = list.find((b) => new Date(b.starts_at) > now);
  const dayOf = (iso) => { const d = new Date(iso), t = new Date(); return d.toDateString() === t.toDateString() ? "" : d.toLocaleDateString([], { weekday: "short" }) + " "; };
  if (cur) return { busy: true, line: `Busy until ${fmtTime(cur.ends_at)}, ${cur.user_name}`, short1: `${cur.user_name} until ${fmtTime(cur.ends_at)}`, short2: next ? `Next ${dayOf(next.starts_at)}${fmtTime(next.starts_at)}` : "" };
  if (next) return { busy: false, line: `Free. Next: ${dayOf(next.starts_at)}${fmtTime(next.starts_at)}, ${next.user_name}`, short1: `Next ${dayOf(next.starts_at)}${fmtTime(next.starts_at)}`, short2: next.user_name };
  return { busy: false, line: "Free, nothing booked", short1: "Nothing booked", short2: "" };
}

// ---- receipts / photos ----
function photosFor(ref) { return (F?.x?.attachments || []).filter((a) => a.ref_id === ref); }
function photoLinks(ref) {
  const p = photosFor(ref);
  return p.map((a, i) => `<button type="button" class="photo-link" data-photo="${a.id}">${icon("clip")}${p.length > 1 ? `Photo ${i + 1}` : "Photo"}</button>`).join("");
}
function wirePhotoLinks(root) {
  root.querySelectorAll("[data-photo]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); openPhoto(b.dataset.photo); }));
}
async function openPhoto(id) {
  openSheet("Photo", "", `<div class="photo-view"><div class="photo-loading">Loading…</div></div><div class="modal-actions"><button class="btn ghost" id="phClose">Close</button></div>`,
    (m) => m.querySelector("#phClose").addEventListener("click", closeSheet));
  const { data, error } = await sb.rpc("fund_attachment", { p_name: auth.name, p_pin: auth.pin, p_id: id });
  const box = document.querySelector("#sheetOverlay .photo-view");
  if (!box) return;
  box.innerHTML = error || !data ? `<div class="photo-loading">Couldn't load the photo.</div>` : `<img src="${data}" alt="Receipt photo" />`;
}
// shrink a photo to a JPEG data URL under ~600 KB before uploading
function compressImage(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error("Pick a photo"));
    const img = new Image();
    img.onload = () => {
      let max = 1400, q = 0.72, out = "";
      for (let i = 0; i < 6; i++) {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        out = c.toDataURL("image/jpeg", q);
        if (out.length < 600000) break;
        max *= 0.8; q -= 0.08;
      }
      URL.revokeObjectURL(img.src);
      out.length < 690000 ? resolve(out) : reject(new Error("That photo is too big"));
    };
    img.onerror = () => reject(new Error("Couldn't read that photo"));
    img.src = URL.createObjectURL(file);
  });
}
async function uploadPhoto(ref, file) {
  if (!file) return true;
  try {
    const data = await compressImage(file);
    const { error } = await sb.rpc("fund_attach", { p_name: auth.name, p_pin: auth.pin, p_ref: ref, p_data: data });
    if (error) throw error;
    return true;
  } catch (e) { toast(e.message || String(e)); return false; }
}
function photoInputHtml(id, label = "Add a photo (optional)") {
  return `<label class="photo-pick">${icon("clip")}<span data-photo-label>${esc(label)}</span><input id="${id}" type="file" accept="image/*" hidden /></label>`;
}
function wirePhotoInput(root, id) {
  const inp = root.querySelector("#" + id);
  inp?.addEventListener("change", () => { const l = inp.closest(".photo-pick").querySelector("[data-photo-label]"); l.textContent = inp.files[0] ? inp.files[0].name : "Add a photo (optional)"; });
  return () => inp?.files?.[0] || null;
}

function memberCount() { return F ? F.members.length : 0; }
function memberByDesk(id) { return F?.members.find((m) => m.desk_id === id) || null; }
function isAdmin() { return F?.me.role === "admin"; }

// ---- pop-up sheet (reuses the auth modal look) ----
function openSheet(title, sub, bodyHtml, onMount) {
  let ov = document.getElementById("sheetOverlay");
  if (!ov) {
    ov = document.createElement("div");
    ov.id = "sheetOverlay"; ov.className = "overlay";
    ov.innerHTML = `<div class="modal sheet"></div>`;
    document.body.appendChild(ov);
    ov.addEventListener("click", (e) => { if (e.target === ov) closeSheet(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });
  }
  ov.querySelector(".modal").innerHTML = `<h2>${esc(title)}</h2>${sub ? `<div class="sub">${sub}</div>` : ""}${bodyHtml}`;
  ov.classList.add("open");
  if (onMount) onMount(ov.querySelector(".modal"));
  setTimeout(() => ov.querySelector("input,textarea,select")?.focus(), 30);
}
function closeSheet() { document.getElementById("sheetOverlay")?.classList.remove("open"); }
function sheetError(m, msg) { const e = m.querySelector(".sheet-err"); if (e) e.textContent = msg || ""; }

/* ============================================================
   Floor plan — Malek's office, desks coloured by balance
   ============================================================ */
function renderFundPlan(el, opts = {}) {
  if (!el || !F) return;
  const P = FUND_PLAN, v = P.view;
  const mr = meetingStatus();
  const rooms = P.rooms.map((r) => r.meeting
    ? `<g class="fp-meeting ${mr.busy ? "busy" : "free"}" tabindex="0" role="button" aria-label="Meeting room: ${esc(mr.line)}">
         <rect class="fp-room meeting" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}"></rect>
         <text class="fp-area" x="${r.x + 22}" y="${r.y + 48}">${esc(r.name)}</text>
         <text class="fp-mr-state" x="${r.x + 22}" y="${r.y + 96}">${esc(mr.busy ? "Busy now" : "Free now")}</text>
         <text class="fp-mr-line" x="${r.x + 22}" y="${r.y + 132}">${esc(mr.short1)}</text>
         <text class="fp-mr-line" x="${r.x + 22}" y="${r.y + 162}">${esc(mr.short2)}</text>
         <text class="fp-mr-cta" x="${r.x + 22}" y="${r.y + r.h - 28}">Tap to book</text>
       </g>`
    : `<rect class="fp-room ${r.active ? "active" : "inactive"}" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}"></rect>`).join("");
  const labels = P.rooms.filter((r) => !r.meeting).map((r) => r.active
    ? `<text class="fp-area" x="${r.lx}" y="${r.ly}">${esc(r.name)}</text>`
    : `<text class="fp-muted" x="${r.x + r.w / 2}" y="${r.y + r.h / 2}" text-anchor="middle" dominant-baseline="central">${esc(r.name)}</text>`).join("");
  const walls = P.walls.map((w) => wallSegs(w).map(([a, b]) => `<line class="fp-wall" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}"></line>`).join("")).join("");
  const desks = P.desks.map((d) => {
    const m = memberByDesk(d.id);
    const cx = d.x + d.w / 2;
    if (!m) {
      return `<g class="fp-desk free" data-desk="${d.id}">
        <rect x="${d.x}" y="${d.y}" width="${d.w}" height="${d.h}" rx="14"></rect>
        <text class="fp-name" x="${cx}" y="${d.y + 44}" text-anchor="middle">Free desk</text>
        <text class="fp-bal" x="${cx}" y="${d.y + 76}" text-anchor="middle">${esc(d.label)}</text></g>`;
    }
    const st = balanceState(m.balance_fils);
    const me = m.name === F.me.name ? " me" : "";
    const nm = m.name.length > 11 ? m.name.slice(0, 10) + "…" : m.name;
    const bal = m.balance_fils < 0 ? `Owes ${jdShort(-m.balance_fils)}` : jd(m.balance_fils);
    return `<g class="fp-desk ${st}${me}" data-desk="${d.id}" tabindex="0" role="button" aria-label="${esc(m.name)}: ${esc(balanceText(m.balance_fils))}">
      <rect x="${d.x}" y="${d.y}" width="${d.w}" height="${d.h}" rx="14"></rect>
      <text class="fp-name" x="${cx}" y="${d.y + 44}" text-anchor="middle">${esc(nm)}</text>
      <text class="fp-bal" x="${cx}" y="${d.y + 78}" text-anchor="middle">${esc(bal)}</text>
      ${m.pending_fils > 0 ? `<circle class="fp-pend" cx="${d.x + d.w - 14}" cy="${d.y + 14}" r="8"></circle>` : ""}
      ${personByName(m.name)?.active ? `<circle class="fp-active" cx="${d.x + 14}" cy="${d.y + 14}" r="8"><title>Active now</title></circle>` : ""}
      ${inOffice(m.name) ? `<g class="fp-in"><rect x="${d.x + d.w - 46}" y="${d.y + d.h - 15}" width="52" height="26" rx="13"></rect><text x="${d.x + d.w - 20}" y="${d.y + d.h + 3}" text-anchor="middle">In</text></g>` : ""}</g>`;
  }).join("");
  el.innerHTML = `
    <svg class="fp-svg" viewBox="${v.x} ${v.y} ${v.w} ${v.h}" role="img" aria-label="Malek's office floor plan with each member's desk and balance">
      ${rooms}${walls}${labels}${desks}
    </svg>
    <div class="fp-legend">
      <span><i class="sw ok"></i>In credit</span><span><i class="sw low"></i>Under 10 JD</span>
      <span><i class="sw owed"></i>Owes money</span><span><i class="sw free"></i>Free desk</span>
      <span><i class="sw pend"></i>Deposit waiting</span><span><i class="sw act"></i>Active now</span><span><i class="sw in"></i>In the office today</span>
    </div>
    <div class="fp-admin">Admin: ${F.admins.map((a) => `${presenceDot(personByName(a))}<b>${esc(a)}</b> · ${esc(lastSeenText(personByName(a)))}`).join(", ") || "—"} · no desk, no share, no vote</div>`;
  el.querySelector(".fp-meeting")?.addEventListener("click", () => { location.href = "office.html#meeting"; });
  el.querySelector(".fp-meeting")?.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") location.href = "office.html#meeting"; });
  el.querySelectorAll(".fp-desk").forEach((g) => {
    const open = () => (opts.onDesk || showDeskCard)(g.dataset.desk);
    g.addEventListener("click", open);
    g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
  });
}
function wallSegs(w) {
  const horiz = w.y1 === w.y2;
  const a = horiz ? Math.min(w.x1, w.x2) : Math.min(w.y1, w.y2), b = horiz ? Math.max(w.x1, w.x2) : Math.max(w.y1, w.y2);
  const pt = (t) => (horiz ? [t, w.y1] : [w.x1, t]);
  if (!w.doorGap) return [[pt(a), pt(b)]];
  return [[pt(a), pt(w.doorGap[0])], [pt(w.doorGap[1]), pt(b)]];
}
function showDeskCard(deskId) {
  const d = FUND_PLAN.desks.find((x) => x.id === deskId);
  const m = memberByDesk(deskId);
  if (!m) {
    openSheet(d.label, "This desk is free.", `<div class="modal-actions"><button class="btn ghost" id="shClose">Close</button></div>`,
      (el) => el.querySelector("#shClose").addEventListener("click", closeSheet));
    return;
  }
  if (m.name === F.me.name && document.getElementById("wallet")) {
    document.getElementById("wallet").scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  const pp = personByName(m.name);
  openSheet(m.name, `${esc(d.label)} · ${d.area === "kitchen" ? "Kitchen" : "Desks area"} · ${presenceDot(pp)}${esc(lastSeenText(pp))}`, `
    <div class="sheet-bal ${balanceState(m.balance_fils)}">${esc(balanceText(m.balance_fils))}</div>
    ${m.pending_fils > 0 ? `<div class="sheet-note">${jd(m.pending_fils)} deposit waiting for the admin</div>` : ""}
    <div class="modal-actions"><button class="btn ghost" id="shClose">Close</button></div>`,
    (el) => el.querySelector("#shClose").addEventListener("click", closeSheet));
}

/* ============================================================
   Fund forecast — what the next 30 days of bills (and approved
   wishlist items) will do to a balance.
   ============================================================ */
function forecastFor(balanceFils, whole = false) {
  const n = whole ? 1 : Math.max(1, memberCount());
  const items = (F.upcoming || []).map((u) => ({
    ...u,
    share_fils: u.total_fils == null ? null : Math.ceil(u.total_fils / n),
  })).sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
  const known = items.filter((i) => i.share_fils != null);
  const totalShare = known.reduce((s, i) => s + i.share_fils, 0);
  const after = balanceFils - totalShare;
  const monthlyShare = Math.ceil((F.monthly_fils || 0) / n);
  const months = balanceFils > 0 && monthlyShare > 0 ? Math.floor(balanceFils / monthlyShare) : 0;
  return { items, totalShare, after, topUp: after < 0 ? -after : 0, monthlyShare, months, unknown: items.some((i) => i.share_fils == null) };
}
function forecastHtml(balanceFils, who = "you") {
  const whole = who === "fund";
  const fc = forecastFor(balanceFils, whole);
  if (!fc.items.length) return `<div class="fc-empty">No bills or approved buys coming up in the next 30 days.</div>`;
  const rows = fc.items.map((i) => `
    <div class="fc-row">
      <span class="fc-date">${i.date ? fmtDay(i.date) : "Any day"}</span>
      <span class="fc-label">${esc(i.label)}${i.kind === "wishlist" ? ` <span class="fc-tag">approved buy</span>` : ""}${i.waiting ? ` <span class="fc-tag">due now</span>` : ""}</span>
      <span class="fc-amt">${i.share_fils == null ? "amount not known yet" : (i.estimated ? "≈ " : "") + "−" + jdShort(i.share_fils)}</span>
    </div>`).join("");
  const you = who === "you";
  const subj = whole ? "the fund will" : you ? "you'll" : "they'll";
  const poss = whole ? "the fund" : you ? "your balance" : "their balance";
  return `
    <div class="fc-rows">${rows}</div>
    <div class="fc-after ${fc.after < 0 ? "owed" : ""}">
      <span>After these, ${subj} be at</span><b>${esc(balanceText(fc.after))}</b>
    </div>
    ${fc.topUp > 0 ? `<div class="fc-tip">${whole ? "Members need to deposit" : "Deposit"} <b>${jd(fc.topUp)}</b>${whole ? " in total" : ""} to stay at zero.</div>`
                   : fc.months > 0 ? `<div class="fc-tip">At about ${jd(fc.monthlyShare)} a month${whole ? "" : " each"}, ${poss} covers <b>${fc.months} month${fc.months === 1 ? "" : "s"}</b> of bills.</div>` : ""}
    ${fc.unknown ? `<div class="fc-foot">Some bills have no amount yet, so the real number may be lower.</div>` : `<div class="fc-foot">≈ means an estimate from the last 3 months.</div>`}`;
}

/* ============================================================
   Notifications
   ============================================================ */
const NOTIF_ICON = {
  deposit_approved: "wallet", deposit_rejected: "x", deposit_request: "wallet", purchase: "receipt", bill: "calendar",
  bill_due: "calendar", owed: "bolt", reversal: "receipt", proposal_new: "bag", proposal_approved: "check",
  proposal_rejected: "x", proposal_expired: "x", proposal_withdrawn: "x", vote_reminder: "bell", statement: "chart", welcome: "sparkle",
  mention: "chat", chore: "sweep", test: "bell",
};
function notificationsHtml(list) {
  if (!list.length) return emptyBlock("Nothing yet. Every change to your money will show up here.");
  return list.map((n) => `
    <a class="notif ${n.read_at ? "" : "unread"} k-${esc(n.kind)}" href="${esc(n.link || "#")}" data-id="${n.id}">
      <span class="notif-ico">${icon(NOTIF_ICON[n.kind] || "bell")}</span>
      <span class="notif-main"><span class="notif-title">${esc(n.title)}</span><span class="notif-body">${esc(n.body || "")}</span></span>
      <span class="notif-when">${esc(relShort(n.created_at))}</span>
    </a>`).join("");
}
function wireNotifications(el) {
  el.querySelectorAll(".notif.unread").forEach((a) => a.addEventListener("click", () => {
    sb.rpc("fund_mark_read", { p_name: auth.name, p_pin: auth.pin, p_ids: [a.dataset.id] }).then(() => refreshBell());
  }));
}
async function markAllRead() { await callRpc("fund_mark_read", { p_ids: null }, "All caught up"); refreshBell(); }

// boot
loadFund();
