/* ============================================================
   Chat — one room for the six members and the admin, with who's
   active now and when everyone was last active. Polls every 4 s
   while the tab is visible (fund tables aren't readable directly,
   so there's no realtime subscription).
   ============================================================ */
renderNav("chat");

const $ = (id) => document.getElementById(id);
const chat = { msgs: [], lastId: 0, people: [], me: null, started: false, busy: false, timer: null };

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
      <div class="msg-bubble">${linkify(esc(m.body)).replace(/\n/g, "<br>")}</div>
      <div class="msg-time">${esc(new Date(m.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }))}</div>
    </div>`;
    lastUser = m.user_name; lastTime = t;
  }
  $("chatList").innerHTML = html;
}

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
input.addEventListener("keydown", (e) => {
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
