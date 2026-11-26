/* ============================================================
   Settings — phone notifications (Web Push), WhatsApp alerts
   (CallMeBot), language, theme, password.
   ============================================================ */
renderNav(null);

const $ = (id) => document.getElementById(id);
const CALLMEBOT_URL = "https://www.callmebot.com/?p=4333";

onFund = () => { renderPush(); renderWhatsApp(); renderLook(); };

/* ---------- phone notifications ---------- */
function b64ToBytes(s) {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
async function currentSub() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}
async function renderPush() {
  const s = F.x.settings || {};
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const sub = supported ? await currentSub() : null;
  const perm = supported ? Notification.permission : "unsupported";
  let state, action = "";
  if (!supported && isIOS && !standalone) {
    state = `On iPhone, first add this site to your Home Screen: tap Share, then "Add to Home Screen". Open it from there and come back here.`;
  } else if (!supported) {
    state = "This browser can't show notifications. Try Chrome, Edge or Safari.";
  } else if (perm === "denied") {
    state = "Notifications are blocked for this site. Allow them in your browser's site settings, then reload.";
  } else if (sub) {
    state = "On for this device.";
    action = `<button class="btn ghost small" id="pushOff">Turn off on this device</button>`;
  } else {
    state = "Off for this device.";
    action = `<button class="btn primary small" id="pushOn">Turn on for this device</button>`;
  }
  $("pushBody").innerHTML = `
    <div class="set-row"><div><b>Phone and computer notifications</b><div class="set-sub">${esc(state)}</div>
      <div class="set-sub">Devices with notifications on: ${s.push_devices || 0}</div></div><div class="set-act">${action}</div></div>
    <label class="set-row check-row"><div><b>Chat messages</b><div class="set-sub">Also notify me about new chat messages. Mentions always notify.</div></div>
      <input type="checkbox" id="pushChat" ${s.push_chat !== false ? "checked" : ""} /></label>
    <div class="set-row"><div><b>Test</b><div class="set-sub">Sends a test alert to every device and WhatsApp you've set up.</div></div>
      <div class="set-act"><button class="btn ghost small" id="testAlert">Send me a test</button></div></div>`;
  $("pushOn")?.addEventListener("click", enablePush);
  $("pushOff")?.addEventListener("click", disablePush);
  $("pushChat").addEventListener("change", (e) => saveSettings({ p_push_chat: e.target.checked }, e.target.checked ? "Chat notifications on" : "Chat notifications off"));
  $("testAlert").addEventListener("click", () => callRpc("fund_test_alert", {}, "Test sent. It should arrive in a few seconds."));
}
async function enablePush() {
  try {
    if (!F.x.vapid_public) throw new Error("Notifications aren't set up on the server yet");
    const perm = await Notification.requestPermission();
    if (perm !== "granted") throw new Error("Notifications weren't allowed");
    const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register("sw.js"));
    await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(F.x.vapid_public) });
    const j = sub.toJSON();
    const ok = await callRpc("fund_push_subscribe", { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth }, "Notifications are on for this device");
    if (ok) renderPush();
  } catch (e) { toast(e.message || String(e)); }
}
async function disablePush() {
  const sub = await currentSub();
  if (sub) {
    await callRpc("fund_push_unsubscribe", { p_endpoint: sub.endpoint }, "Notifications are off for this device");
    await sub.unsubscribe().catch(() => {});
  }
  renderPush();
}

/* ---------- WhatsApp ---------- */
function renderWhatsApp() {
  const s = F.x.settings || {};
  $("waBody").innerHTML = `
    <ol class="wa-steps">
      <li>Open <a href="${CALLMEBOT_URL}" target="_blank" rel="noopener noreferrer">CallMeBot's WhatsApp setup page</a> and save the bot's number in your contacts (it changes sometimes, so use the number shown there).</li>
      <li>Send it this WhatsApp message: <code>I allow callmebot to send me messages</code></li>
      <li>It replies with your API key. Paste it below with your own WhatsApp number.</li>
    </ol>
    <div class="auth-fields">
      <input id="waPhone" class="fld" type="tel" placeholder="Your WhatsApp number, like +962791234567" value="${esc(s.wa_phone || "")}" />
      <input id="waKey" class="fld" type="text" inputmode="numeric" placeholder="${s.has_wa_key ? "API key saved. Type a new one to replace it" : "API key from CallMeBot"}" />
      <label class="check"><input type="checkbox" id="waOn" ${s.wa_enabled ? "checked" : ""}/> Send me WhatsApp alerts</label>
    </div>
    <div class="set-sub">You'll get WhatsApp messages for money changes, bills, votes, chores and mentions (not every chat message). CallMeBot is a free third-party service for personal use.</div>
    <div class="modal-actions"><button class="btn primary" id="waSave">Save</button></div>`;
  $("waSave").addEventListener("click", () => {
    const phone = $("waPhone").value.trim(), key = $("waKey").value.trim(), on = $("waOn").checked;
    if (on && !phone) return toast("Enter your WhatsApp number");
    if (on && !key && !s.has_wa_key) return toast("Paste the API key from CallMeBot");
    saveSettings({ p_wa_phone: phone, p_wa_key: key, p_wa_enabled: on }, on ? "WhatsApp alerts on. Use Send me a test to check." : "WhatsApp settings saved");
  });
}
function saveSettings(over, msg) {
  const s = F.x.settings || {};
  return callRpc("fund_settings_save", Object.assign({ p_wa_phone: s.wa_phone || "", p_wa_key: "", p_wa_enabled: !!s.wa_enabled, p_push_chat: s.push_chat !== false }, over), msg);
}

/* ---------- look + account ---------- */
function renderLook() {
  const lang = document.documentElement.lang === "ar" ? "ar" : "en";
  const theme = localStorage.getItem("theme") || "system";
  $("lookBody").innerHTML = `
    <div class="set-row"><div><b>Language</b><div class="set-sub">العربية or English, on this device.</div></div>
      <div class="seg small">${[["en", "English"], ["ar", "العربية"]].map(([v, l]) => `<button type="button" class="seg-btn ${lang === v ? "on" : ""}" data-lang="${v}">${l}</button>`).join("")}</div></div>
    <div class="set-row"><div><b>Theme</b><div class="set-sub">Light, dark, or follow your device.</div></div>
      <div class="seg small">${[["light", "Light"], ["dark", "Dark"], ["system", "Auto"]].map(([v, l]) => `<button type="button" class="seg-btn ${theme === v ? "on" : ""}" data-theme="${v}">${l}</button>`).join("")}</div></div>
    <div class="set-row"><div><b>Password</b><div class="set-sub">Signed in as ${esc(F.me.name)}.</div></div>
      <div class="set-act"><button class="btn ghost small" id="pwChange">Change password</button></div></div>`;
  $("lookBody").querySelectorAll("[data-lang]").forEach((b) => b.addEventListener("click", () => { setLang(b.dataset.lang); renderLook(); }));
  $("lookBody").querySelectorAll("[data-theme]").forEach((b) => b.addEventListener("click", () => {
    const v = b.dataset.theme;
    if (v === "system") { try { localStorage.removeItem("theme"); } catch {} setTheme(matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"); localStorage.removeItem("theme"); }
    else setTheme(v);
    renderLook();
  }));
  $("pwChange").addEventListener("click", changePassword);
}
