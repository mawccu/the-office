// Delivers office-fund alerts: phone push (Web Push) and WhatsApp (CallMeBot).
// Called by a database trigger (pg_net) with a shared secret, never by browsers.
// Deployed to Supabase as the "office-notify" edge function (verify_jwt off;
// it checks the x-office-secret header against fund_config.hook_secret).
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const SITE = "https://mawccu.github.io/the-office/";
// kinds that are worth a WhatsApp message (chat itself is push-only)
const WA_KINDS = new Set([
  "deposit_approved", "deposit_rejected", "deposit_request", "purchase", "bill", "bill_due", "owed", "reversal",
  "proposal_new", "proposal_approved", "proposal_rejected", "vote_reminder", "chore", "mention", "test",
]);

let cfg: Record<string, string> | null = null;
async function config() {
  if (cfg) return cfg;
  const { data, error } = await sb.from("fund_config").select("key,value");
  if (error) throw error;
  cfg = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
  webpush.setVapidDetails(cfg.vapid_subject, cfg.vapid_public, cfg.vapid_private);
  return cfg;
}
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

async function pushTo(user: string, payload: Record<string, string>) {
  const { data: subs } = await sb.from("fund_push_subs").select("*").eq("user_name", user);
  let sent = 0;
  for (const s of subs || []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 3600 },
      );
      sent++;
      await sb.from("fund_push_subs").update({ last_ok_at: new Date().toISOString(), fail_count: 0 }).eq("endpoint", s.endpoint);
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await sb.from("fund_push_subs").delete().eq("endpoint", s.endpoint);
      else await sb.from("fund_push_subs").update({ fail_count: (s.fail_count || 0) + 1 }).eq("endpoint", s.endpoint);
      console.log("push failed", user, code, String(e).slice(0, 200));
    }
  }
  return sent;
}

async function whatsapp(u: { wa_enabled: boolean; wa_phone: string | null; wa_key: string | null } | null, text: string) {
  if (!u?.wa_enabled || !u.wa_phone || !u.wa_key) return false;
  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(u.wa_phone)}&apikey=${encodeURIComponent(u.wa_key)}&text=${encodeURIComponent(text)}`;
  try {
    const r = await fetch(url);
    const body = await r.text();
    if (!r.ok) console.log("whatsapp failed", r.status, body.slice(0, 200));
    return r.ok;
  } catch (e) {
    console.log("whatsapp error", String(e).slice(0, 200));
    return false;
  }
}

Deno.serve(async (req) => {
  try {
    const c = await config();
    if (!c.hook_secret || req.headers.get("x-office-secret") !== c.hook_secret) return json({ error: "forbidden" }, 403);
    const { type, id } = await req.json();

    if (type === "notification") {
      const { data: n } = await sb.from("fund_notifications").select("*").eq("id", id).maybeSingle();
      if (!n) return json({ skip: "missing" });
      const { data: u } = await sb.from("users").select("name,wa_phone,wa_key,wa_enabled").eq("name", n.user_name).maybeSingle();
      const link = SITE + (n.link || "fund.html");
      const sent = await pushTo(n.user_name, { title: n.title, body: n.body || "", url: link, tag: n.kind });
      const wa = WA_KINDS.has(n.kind) ? await whatsapp(u, `*${n.title}*\n${n.body || ""}\n${link}`) : false;
      return json({ sent, wa });
    }

    if (type === "message") {
      const { data: m } = await sb.from("fund_messages").select("*").eq("id", id).maybeSingle();
      if (!m) return json({ skip: "missing" });
      const { data: people } = await sb.from("users").select("name,push_chat").not("fund_role", "is", null).neq("name", m.user_name);
      const body = String(m.body);
      const everyone = /(^|\s)@(all|everyone)\b/i.test(body);
      let sent = 0;
      for (const p of people || []) {
        if (!p.push_chat) continue;
        // people who were @mentioned already get a "mentioned you" alert
        const esc = p.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (everyone || new RegExp(`(^|\\s)@${esc}\\b`, "i").test(body)) continue;
        sent += await pushTo(p.name, { title: `${m.user_name} in chat`, body: body.slice(0, 180), url: SITE + "chat.html", tag: "chat" });
      }
      return json({ sent });
    }
    return json({ skip: "type" });
  } catch (e) {
    console.log("error", String(e).slice(0, 300));
    return json({ error: String(e).slice(0, 200) }, 500);
  }
});
