/* ============================================================
   Chat — one room for the six members and the admin, with who's
   active now and when everyone was last active. Polls every 4 s
   while the tab is visible (fund tables aren't readable directly,
   so there's no realtime subscription).
   ============================================================ */
renderNav("chat");

const $ = (id) => document.getElementById(id);
const chat = { msgs: [], lastId: 0, people: [], me: null, started: false, busy: false, timer: null, rx: {}, rxKey: "", polls: {}, pollKey: "", seenKey: "" };
const EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

onFund = () => {
  if (chat.started) return;
  chat.started = true;
  chatUnread = 0; renderNav();
  pollChat(true);
  chat.timer = setInterval(() => { if (!document.hidden) pollChat(); }, 4000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) pollChat(); });
};

async function pollChat(first) {
  if (!auth || chat.busy) return;
  chat.busy = true;
  try {
    const { data, error } = await sb.rpc("fund_chat", { p_name: auth.name, p_pin: auth.pin, p_after: chat.lastId });
    if (error) throw error;
    chat.me = data.me;
    chat.people = data.people || [];
    if (F) F.people = chat.people;
    const rxKey = JSON.stringify(data.reactions || []);
    const rxChanged = rxKey !== chat.rxKey;
    if (rxChanged) {
      chat.rxKey = rxKey; chat.rx = {};
      (data.reactions || []).forEach((r) => { (chat.rx[r.message_id] = chat.rx[r.message_id] || []).push(r); });
    }
    const pollKey = JSON.stringify(data.polls || []);
    const pollChanged = pollKey !== chat.pollKey;
    if (pollChanged) { chat.pollKey = pollKey; chat.polls = {}; (data.polls || []).forEach((p) => (chat.polls[p.id] = p)); }
    const seenKey = chat.people.map((p) => p.name + ":" + p.read_id).join(",");
    const seenChanged = seenKey !== chat.seenKey; chat.seenKey = seenKey;
    if (!data.messages.length && (rxChanged || pollChanged || seenChanged) && !first) renderMessages();
    if (data.messages.length) {
      const nearBottom = isNearBottom();
      chat.msgs.push(...data.messages);
      chat.lastId = chat.msgs[chat.msgs.length - 1].id;
      renderMessages();
      if (first || nearBottom) scrollToBottom();
    } else if (first) {
      renderMessages();
    }
    renderPeople();
  } catch (e) {
    if (first) toast(e.message || String(e));
  } finally {
    chat.busy = false;
  }
}

/* ---------- messages ---------- */
function isNearBottom() { const s = $("chatScroll"); return s.scrollHeight - s.scrollTop - s.clientHeight < 120; }
function scrollToBottom() { const s = $("chatScroll"); s.scrollTop = s.scrollHeight; }
function dayLabel(d) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  const diff = Math.round((t - x) / 86400000);
  return diff === 0 ? "Today" : diff === 1 ? "Yesterday" : x.toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" });
}
function linkify(escaped) {
  return escaped.replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]/g, (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
}
function renderMessages() {
  if (!chat.msgs.length) {
    $("chatList").innerHTML = `<div class="chat-empty">No messages yet. Say hi to the office.</div>`;
    return;
  }
  let html = "", lastDay = "", lastUser = "", lastTime = 0;
  const lastMine = [...chat.msgs].reverse().find((m) => m.user_name === chat.me);
  for (const m of chat.msgs) {
    const day = dayLabel(m.created_at);
    if (day !== lastDay) { html += `<div class="chat-day"><span>${esc(day)}</span></div>`; lastDay = day; lastUser = ""; }
    const t = new Date(m.created_at).getTime();
    const mine = m.user_name === chat.me;
    const grouped = m.user_name === lastUser && t - lastTime < 5 * 60000;
    const person = chat.people.find((p) => p.name === m.user_name);
    const isAdminMsg = person?.role === "admin";
    html += `<div class="msg ${mine ? "mine" : ""} ${grouped ? "grouped" : ""}">
      ${!mine && !grouped ? `<div class="msg-who">${esc(m.user_name)}${isAdminMsg ? ` <span class="msg-tag">admin</span>` : ""}</div>` : ""}
      <div class="msg-line"><div class="msg-bubble${m.poll_id ? " poll-bubble" : ""}">${m.poll_id && chat.polls[m.poll_id] ? pollHtml(chat.polls[m.poll_id]) : mentionify(linkify(esc(m.body))).replace(/\n/g, "<br>")}</div>
        <button class="rx-add" type="button" data-pick="${m.id}" aria-label="React">${icon("plus")}</button></div>
      ${reactionsHtml(m.id)}
      <div class="msg-time">${esc(new Date(m.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }))}</div>
      ${lastMine && m.id === lastMine.id ? `<div class="msg-seen">${esc(seenText(m.id))}</div>` : ""}
    </div>`;
    lastUser = m.user_name; lastTime = t;
  }
  $("chatList").innerHTML = html;
  $("chatList").querySelectorAll("[data-rx]").forEach((b) => b.addEventListener("click", () => react(b.dataset.rx, b.dataset.emoji)));
  $("chatList").querySelectorAll("[data-pick]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); openPicker(b); }));
  $("chatList").querySelectorAll("[data-pvote]").forEach((b) => b.addEventListener("click", () => pollAction("fund_poll_vote", { p_poll: b.dataset.pvote, p_option: Number(b.dataset.opt) })));
  $("chatList").querySelectorAll("[data-pclose]").forEach((b) => b.addEventListener("click", () => { if (confirm("Close this poll? Nobody can vote after that.")) pollAction("fund_poll_close", { p_poll: b.dataset.pclose }); }));
}

/* ---------- read receipts ---------- */
function seenText(id) {
  const others = chat.people.filter((p) => p.name !== chat.me);
  const seen = others.filter((p) => Number(p.read_id) >= id).map((p) => p.name);
  if (!seen.length) return "Sent";
  if (seen.length === others.length) return "Seen by everyone";
  return seen.length <= 3 ? `Seen by ${seen.join(", ")}` : `Seen by ${seen.length} of ${others.length}`;
}

/* ---------- polls ---------- */
function pollHtml(p) {
  const voters = new Set(p.votes.map((v) => v.user_name));
  const total = voters.size;
  const mine = new Set(p.votes.filter((v) => v.user_name === chat.me).map((v) => v.option_idx));
  const canClose = !p.closed_at && (p.created_by === chat.me || chat.people.find((x) => x.name === chat.me)?.role === "admin");
  return `<div class="poll">
    <div class="poll-q">${icon("chart")} <span>${esc(p.question)}</span></div>
    <div class="poll-sub">${p.multi ? "Pick one or more" : "Pick one"} · ${total} voted${p.closed_at ? " · Closed" : ""}</div>
    ${p.options.map((o, i) => {
      const who = p.votes.filter((v) => v.option_idx === i).map((v) => v.user_name);
      const pct = total ? Math.round((who.length / total) * 100) : 0;
      return `<button type="button" class="poll-opt ${mine.has(i) ? "on" : ""}" ${p.closed_at ? "disabled" : ""} data-pvote="${p.id}" data-opt="${i}" title="${esc(who.join(", ") || "No votes yet")}">
        <span class="poll-fill" style="width:${pct}%"></span>
        <span class="poll-txt">${mine.has(i) ? icon("check") : ""}${esc(o)}</span><span class="poll-n">${who.length}</span></button>`;
    }).join("")}
    ${canClose ? `<button type="button" class="linkbtn poll-close" data-pclose="${p.id}">Close poll</button>` : ""}
  </div>`;
}
async function pollAction(fn, params) {
  try {
    const { error } = await sb.rpc(fn, { p_name: auth.name, p_pin: auth.pin, ...params });
    if (error) throw error;
    await pollChat();
  } catch (e) { toast(e.message || String(e)); }
}
$("pollBtn").addEventListener("click", () => {
  openSheet("New poll", "Everyone in the chat can vote. Tap an option again to take your vote back.", `
    <div class="auth-fields">
      <input id="pqQ" class="fld" type="text" maxlength="200" placeholder="Question, like Lunch today?" />
      <div id="pqOpts" class="auth-fields">
        ${[1, 2, 3].map((n) => `<input class="fld pq-opt" type="text" maxlength="80" placeholder="Option ${n}" />`).join("")}
      </div>
      <button type="button" class="linkbtn" id="pqMore">+ Add option</button>
      <label class="check"><input type="checkbox" id="pqMulti" /> Allow picking more than one</label>
    </div>
    <div class="auth-err sheet-err"></div>
    <div class="modal-actions"><button class="btn ghost" id="pqCancel">Cancel</button><button class="btn primary" id="pqGo">Post poll</button></div>`,
    (m) => {
      m.querySelector("#pqMore").addEventListener("click", () => {
        const n = m.querySelectorAll(".pq-opt").length;
        if (n >= 8) return sheetError(m, "At most 8 options");
        m.querySelector("#pqOpts").insertAdjacentHTML("beforeend", `<input class="fld pq-opt" type="text" maxlength="80" placeholder="Option ${n + 1}" />`);
      });
      m.querySelector("#pqCancel").addEventListener("click", closeSheet);
      m.querySelector("#pqGo").addEventListener("click", async () => {
        const q = m.querySelector("#pqQ").value.trim();
        const opts = [...m.querySelectorAll(".pq-opt")].map((i) => i.value.trim()).filter(Boolean);
        if (!q) return sheetError(m, "Write the question");
        if (opts.length < 2) return sheetError(m, "Give at least 2 options");
        try {
          const { error } = await sb.rpc("fund_poll_create", { p_name: auth.name, p_pin: auth.pin, p_question: q, p_options: opts, p_multi: m.querySelector("#pqMulti").checked });
          if (error) throw error;
          closeSheet(); await pollChat(); scrollToBottom();
        } catch (e) { sheetError(m, e.message || String(e)); }
      });
    });
});
function mentionify(html) {
  const names = chat.people.map((p) => p.name).concat(["all", "everyone"]).sort((a, b) => b.length - a.length);
  if (!names.length) return html;
  const re = new RegExp(`(^|\\s|>)@(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "gi");
  return html.replace(re, (m0, pre, name) => {
    const me = chat.me && (name.toLowerCase() === chat.me.toLowerCase() || /^(all|everyone)$/i.test(name));
    return `${pre}<span class="mention${me ? " me" : ""}">@${esc(name)}</span>`;
  });
}
function reactionsHtml(id) {
  const list = chat.rx[id];
  if (!list?.length) return "";
  return `<div class="rx-row">${list.map((r) => `<button type="button" class="rx ${r.users.includes(chat.me) ? "on" : ""}" data-rx="${id}" data-emoji="${r.emoji}" title="${esc(r.users.join(", "))}">${r.emoji} <span>${r.users.length}</span></button>`).join("")}</div>`;
}
async function react(id, emoji) {
  closePicker();
  try {
    const { error } = await sb.rpc("fund_react", { p_name: auth.name, p_pin: auth.pin, p_message: Number(id), p_emoji: emoji });
    if (error) throw error;
    await pollChat();
  } catch (e) { toast(e.message || String(e)); }
}
function closePicker() { document.querySelector(".rx-picker")?.remove(); }
function openPicker(btn) {
  closePicker();
  const p = document.createElement("div");
  p.className = "rx-picker";
  p.innerHTML = EMOJIS.map((e) => `<button type="button" data-e="${e}">${e}</button>`).join("");
  btn.closest(".msg-line").appendChild(p);
  p.querySelectorAll("button").forEach((b) => b.addEventListener("click", (ev) => { ev.stopPropagation(); react(btn.dataset.pick, b.dataset.e); }));
}
document.addEventListener("click", closePicker);

/* ---------- people ---------- */
function renderPeople() {
  const active = chat.people.filter((p) => p.active).length;
  $("peopleHint").textContent = `${active} active now`;
  $("peopleList").innerHTML = chat.people.map((p) => {
    const desk = FUND_PLAN.desks.find((d) => d.id === p.desk_id);
    return `<div class="person ${p.active ? "on" : ""}">
      <div class="person-av" style="--h:${hashHue(p.name)}">${esc(initials(p.name))}${presenceDot(p)}</div>
      <div class="person-main">
        <div class="person-name">${esc(p.name)}${p.name === chat.me ? ` <span class="person-you">you</span>` : ""}</div>
        <div class="person-sub">${p.role === "admin" ? "Admin" : esc(desk?.label || "")} · ${esc(lastSeenText(p))}</div>
      </div>
    </div>`;
  }).join("");
}

/* ---------- compose ---------- */
const input = $("chatInput");
input.addEventListener("input", () => { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 160) + "px"; });
let mentionSel = 0;
function mentionQuery() {
  const upto = input.value.slice(0, input.selectionStart);
  const m = upto.match(/(^|\s)@([\p{L}\p{N}_]*)$/u);
  return m ? m[2] : null;
}
function mentionOptions(q) {
  const opts = chat.people.map((p) => p.name).filter((n) => n !== chat.me).concat(["all"]);
  return opts.filter((n) => n.toLowerCase().startsWith((q || "").toLowerCase())).slice(0, 6);
}
function renderMentionBox() {
  const q = mentionQuery();
  let box = $("mentionBox");
  const opts = q === null ? [] : mentionOptions(q);
  if (!opts.length) { box?.remove(); return; }
  if (!box) { box = document.createElement("div"); box.id = "mentionBox"; box.className = "mention-box"; $("chatForm").appendChild(box); }
  mentionSel = Math.min(mentionSel, opts.length - 1);
  box.innerHTML = opts.map((n, i) => `<button type="button" class="${i === mentionSel ? "on" : ""}" data-m="${esc(n)}">@${esc(n)}${n === "all" ? " <span>everyone</span>" : ""}</button>`).join("");
  box.querySelectorAll("[data-m]").forEach((b) => b.addEventListener("mousedown", (e) => { e.preventDefault(); insertMention(b.dataset.m); }));
}
function insertMention(name) {
  const pos = input.selectionStart, upto = input.value.slice(0, pos), rest = input.value.slice(pos);
  const start = upto.lastIndexOf("@");
  input.value = upto.slice(0, start) + "@" + name + " " + rest;
  const caret = start + name.length + 2;
  input.setSelectionRange(caret, caret); input.focus();
  $("mentionBox")?.remove();
}
input.addEventListener("input", () => { mentionSel = 0; renderMentionBox(); });
input.addEventListener("blur", () => setTimeout(() => $("mentionBox")?.remove(), 150));
input.addEventListener("keydown", (e) => {
  const box = $("mentionBox");
  if (box) {
    const n = box.querySelectorAll("[data-m]").length;
    if (e.key === "ArrowDown") { e.preventDefault(); mentionSel = (mentionSel + 1) % n; renderMentionBox(); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); mentionSel = (mentionSel - 1 + n) % n; renderMentionBox(); return; }
    if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertMention(box.querySelectorAll("[data-m]")[mentionSel].dataset.m); return; }
    if (e.key === "Escape") { box.remove(); return; }
  }
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("chatForm").requestSubmit(); }
});
$("chatForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = input.value.trim();
  if (!body || !requireAuth()) return;
  $("chatSend").disabled = true;
  try {
    const { error } = await sb.rpc("fund_chat_send", { p_name: auth.name, p_pin: auth.pin, p_body: body });
    if (error) throw error;
    input.value = ""; input.style.height = "auto";
    await pollChat();
    scrollToBottom();
  } catch (err) {
    toast(err.message || String(err));
  } finally {
    $("chatSend").disabled = false;
    input.focus();
  }
});
