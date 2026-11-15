// api/contact.js — Vercel serverless function (ES module: package.json has "type": "module")
//
// The "Work With Me" form still goes to Formspree exactly as before (nothing about that changes).
// In parallel, the page sends the same message here, and within a minute you get a second,
// smarter email: what kind of lead it is, how warm it is, and a reply drafted in your voice,
// ready to send with one tap.
//
// Environment variables (Vercel → zee-portfolio → Settings → Environment Variables; never in code):
//   BREVO_API_KEY      Brevo API key (send-only).
//   ALERT_FROM_EMAIL   A sender already verified in Brevo, e.g. hello@imagendai.com
//   ALERT_TO_EMAIL     Where triage alerts go. Default: madebyyouni@gmail.com
//   GROQ_API_KEY       Groq key. Without it, you still get the alert, just without the AI triage.
//   AUTO_REPLY         Leave unset until the domain is ready; "on" emails the sender the draft automatically.
//   REPLY_FROM_EMAIL   Branded sender for those replies (needs the domain), e.g. zee@madebyyouni.com

const SITE = "https://gotozee.vercel.app";
const OWNER_EMAIL = "madebyyouni@gmail.com";
const APPS = `Nurj (nurjai.com) — AI business command centre for Nigerian side hustlers.
Imagend (imagendai.com) — turns a rough idea into a pro image/video prompt for Midjourney, Nano Banana, Ideogram and more.
Kobo — bookkeeping, invoicing and debt collection for Nigerian freelancers, store owners and SMEs.
Wokbook (wokbook.vercel.app) — AI curriculum builder that proves you actually learned.
Cars by Youni (autoprimecars.vercel.app) — vetted Lagos car marketplace.`;

const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < 10 * 60 * 1000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 5;
}
const clean = (v, n = 400) => String(v == null ? "" : v).replace(/[\u0000-\u0008\u000b-\u001f]/g, " ").trim().slice(0, n);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function withTimeout(promise, ms) {
  let t;
  return Promise.race([promise, new Promise((_, rej) => { t = setTimeout(() => rej(new Error("timeout")), ms); })])
    .finally(() => clearTimeout(t));
}

async function triage(lead) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  const system = `You triage messages sent to Zee (Uzo Nnabike), a Lagos-based solo founder (Made by Youni Ltd) who builds and ships AI-powered web products for Nigerian markets. His public voice is "Built Without Permission": direct, warm, practical, optimistic but realistic, no hype.
His live apps:
${APPS}
Classify the message and draft Zee's reply.
Rules for the reply: first person as Zee; under 120 words; reference what they actually said; if relevant, point to at most two of the apps above by name; never quote prices, timelines or commitments; end with one clear next step (e.g. a 15-minute call this week); sign off "Zee".
If the message is spam, a scam, or SEO/marketing cold outreach, set category "spam" and leave reply empty.
Return JSON only: {"category":"client|partner|investor|tester|recruiter|idea|other|spam","temperature":"hot|warm|cold","reason":"one short sentence","subject":"reply subject","reply":"plain-text email body"}`;
  try {
    const res = await withTimeout(fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: `From: ${lead.name}\nThey picked: ${lead.type || "(nothing)"}\nMessage:\n${lead.message}` }
        ]
      })
    }), 9000);
    if (!res.ok) return null;
    const data = await res.json();
    const out = JSON.parse(data.choices[0].message.content);
    if (!out.category) return null;
    return {
      category: clean(out.category, 20), temperature: ["hot", "warm", "cold"].includes(out.temperature) ? out.temperature : "warm",
      reason: clean(out.reason), subject: clean(out.subject, 120) || "Re: your message", reply: String(out.reply || "").slice(0, 1500)
    };
  } catch (e) {
    return null;
  }
}

async function brevoSend({ from, fromName, to, subject, html, text, replyTo }) {
  const key = process.env.BREVO_API_KEY;
  if (!key || !from || !to) return false;
  try {
    const res = await withTimeout(fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": key, accept: "application/json" },
      body: JSON.stringify({ sender: { email: from, name: fromName }, to: [{ email: to }], replyTo: replyTo ? { email: replyTo } : undefined, subject, htmlContent: html, textContent: text })
    }), 6000);
    return res.ok;
  } catch (e) {
    return false;
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", SITE);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};
  if (body.website) return res.status(200).json({ ok: true }); // honeypot

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (limited(ip)) return res.status(429).json({ error: "Too many messages" });

  const lead = {
    name: clean(body.name, 120),
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(body.email)) ? clean(body.email).toLowerCase() : "",
    type: clean(body.type, 120),
    message: clean(body.message, 3000)
  };
  if (!lead.name || !lead.email || !lead.message) return res.status(400).json({ error: "Missing fields" });

  const ai = await triage(lead);
  if (ai && ai.category === "spam") return res.status(200).json({ ok: true, spam: true });

  const badge = ai ? ({ hot: "🔥", warm: "🟠", cold: "🔵" }[ai.temperature] + " " + ai.category.toUpperCase()) : "📩 NEW";
  const reply = ai && ai.reply ? ai.reply : "";
  const mailto = reply ? `mailto:${encodeURIComponent(lead.email)}?subject=${encodeURIComponent(ai.subject)}&body=${encodeURIComponent(reply)}` : `mailto:${encodeURIComponent(lead.email)}`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;color:#0d0d0f">
  <p style="font-size:12px;letter-spacing:.1em;color:#888;margin:0">PORTFOLIO · WORK WITH ME</p>
  <h2 style="margin:6px 0 4px">${esc(badge)} — ${esc(lead.name)}</h2>
  <p style="margin:0 0 14px;color:#555">${esc(lead.email)}${lead.type ? " · " + esc(lead.type) : ""}</p>
  ${ai ? `<p style="margin:0 0 14px"><b>Why:</b> ${esc(ai.reason)}</p>` : ""}
  <p style="margin:0 0 4px;color:#888;font-size:12px">THEIR MESSAGE</p>
  <blockquote style="margin:0 0 18px;padding:10px 12px;border-left:3px solid #f5a623;background:#f6f5f2;white-space:pre-wrap">${esc(lead.message)}</blockquote>
  ${reply ? `<p style="margin:0 0 4px;color:#888;font-size:12px">DRAFT REPLY (check before sending)</p>
  <pre style="white-space:pre-wrap;background:#f6f5f2;padding:12px;border-radius:8px;font-family:Arial,sans-serif;font-size:14px">${esc(reply)}</pre>` : ""}
  <p><a href="${mailto}" style="background:#f5a623;color:#0d0d0f;padding:10px 14px;border-radius:8px;text-decoration:none">${reply ? "Send this reply" : "Reply"}</a></p>
</div>`;
  const alerted = await brevoSend({
    from: process.env.ALERT_FROM_EMAIL, fromName: "ZEE.DEV leads",
    to: process.env.ALERT_TO_EMAIL || OWNER_EMAIL,
    subject: `${badge} — ${lead.name}${lead.type ? " · " + lead.type : ""}`,
    html, text: `${lead.name} <${lead.email}>\n${lead.type}\n\n${lead.message}\n\nDraft reply:\n${reply}`,
    replyTo: lead.email
  });

  let autoReplied = false;
  if (process.env.AUTO_REPLY === "on" && process.env.REPLY_FROM_EMAIL && reply) {
    autoReplied = await brevoSend({
      from: process.env.REPLY_FROM_EMAIL, fromName: "Zee", to: lead.email, subject: ai.subject,
      html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;white-space:pre-wrap">${esc(reply)}</div>`,
      text: reply, replyTo: OWNER_EMAIL
    });
  }
  return res.status(alerted ? 200 : 202).json({ ok: true, alerted, autoReplied });
}
