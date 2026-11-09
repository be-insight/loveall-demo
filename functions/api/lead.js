// POST /api/lead — receives a lead from the quote form or the chat assistant,
// saves it in D1, then emails it to Loveall (BCC Insight) through Resend.
//
// Bindings / settings (wrangler.toml + Pages secrets):
//   DB              D1 database "loveall-leads"
//   LEAD_TO         leads@beinsight.co before launch; tloveall10@gmail.com after
//   LEAD_FROM       Loveall Website Leads <leads@beinsight.co>
//   LEAD_BCC        leads@beinsight.co (skipped when it equals LEAD_TO)
//   RESEND_API_KEY  secret, set with `wrangler pages secret put RESEND_API_KEY`

const LIMITS = { name: 80, phone: 40, location: 200, service: 80, issue: 2000, urgency: 40, bestTime: 120 };
const MAX_TRANSCRIPT_MSGS = 60;
const MAX_TRANSCRIPT_CHARS = 1000;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const clean = (v, max) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export async function onRequestPost({ request, env }) {
  // Only accept same-origin JSON posts from the site itself.
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) return json({ ok: false, error: "bad_origin" }, 403);
  if (!(request.headers.get("content-type") || "").includes("application/json")) return json({ ok: false, error: "bad_type" }, 415);
  if (Number(request.headers.get("content-length") || 0) > 64_000) return json({ ok: false, error: "too_large" }, 413);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "bad_json" }, 400); }

  // Spam traps: a hidden field real people leave empty, and a minimum time on the page.
  // Pretend success so bots don't learn anything.
  if (body.website || (typeof body.elapsedMs === "number" && body.elapsedMs < 2500)) return json({ ok: true });

  const source = body.source === "chat" ? "chat" : body.source === "quote_form" ? "quote_form" : null;
  const lead = {
    name: clean(body.name, LIMITS.name),
    phone: clean(body.phone, LIMITS.phone),
    location: clean(body.location, LIMITS.location),
    service: clean(body.service, LIMITS.service),
    issue: clean(body.issue, LIMITS.issue),
    urgency: clean(body.urgency, LIMITS.urgency),
    bestTime: clean(body.bestTime, LIMITS.bestTime),
  };
  if (!source || !lead.name || lead.phone.replace(/\D/g, "").length < 10) {
    return json({ ok: false, error: "missing_fields" }, 422);
  }

  let transcript = null;
  if (source === "chat" && Array.isArray(body.transcript)) {
    transcript = body.transcript.slice(-MAX_TRANSCRIPT_MSGS)
      .filter(m => m && typeof m.text === "string")
      .map(m => ({ role: m.role === "user" ? "user" : "assistant", text: m.text.slice(0, MAX_TRANSCRIPT_CHARS) }));
  }

  // Drop exact repeats (double-clicks, retries) from the same phone within 10 minutes.
  const dup = await env.DB.prepare(
    "SELECT id FROM leads WHERE phone = ? AND source = ? AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-10 minutes') LIMIT 1"
  ).bind(lead.phone, source).first();
  if (dup) return json({ ok: true, id: dup.id, duplicate: true });

  const id = crypto.randomUUID();
  const pageUrl = clean(request.headers.get("referer") || "", 300);
  await env.DB.prepare(
    `INSERT INTO leads (id, source, name, phone, location, service, issue, urgency, best_time, transcript, page_url, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, source, lead.name, lead.phone, lead.location || null, lead.service || null, lead.issue || null,
    lead.urgency || null, lead.bestTime || null, transcript ? JSON.stringify(transcript) : null,
    pageUrl || null, clean(request.headers.get("user-agent") || "", 300) || null
  ).run();

  // The lead is saved; email failures are recorded but never lose the lead.
  const sent = await sendEmail(env, id, source, lead, transcript);
  await env.DB.prepare("UPDATE leads SET email_status = ?, email_id = ?, email_error = ? WHERE id = ?")
    .bind(sent.ok ? "sent" : "failed", sent.id || null, sent.error || null, id).run();

  return json({ ok: true, id });
}

export const onRequest = () => json({ ok: false, error: "method_not_allowed" }, 405);

async function sendEmail(env, id, source, lead, transcript) {
  if (!env.RESEND_API_KEY) return { ok: false, error: "RESEND_API_KEY not set" };
  if (!env.LEAD_TO || !env.LEAD_FROM) return { ok: false, error: "LEAD_TO / LEAD_FROM not set" };
  const label = source === "chat" ? "Chat" : "Quote form";
  const rows = [
    ["Name", lead.name], ["Phone", lead.phone], ["Location", lead.location], ["Service", lead.service],
    ["Problem", lead.issue], ["Urgency", lead.urgency], ["Best time", lead.bestTime], ["Came in through", label],
  ].filter(([, v]) => v);

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const telHref = "tel:+1" + lead.phone.replace(/\D/g, "").slice(-10);
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#0E1B33;max-width:560px">
<h2 style="margin:0 0 4px">New request from the website</h2>
<p style="margin:0 0 16px;color:#5b6475">Call <a href="${telHref}">${esc(lead.phone)}</a> to follow up.</p>
<table cellpadding="6" style="border-collapse:collapse">${rows.map(([k, v]) =>
    `<tr><td style="color:#5b6475;vertical-align:top">${esc(k)}</td><td style="font-weight:bold">${esc(v)}</td></tr>`).join("")}</table>
${transcript && transcript.length ? `<h3 style="margin:24px 0 8px">Chat conversation</h3>${transcript.map(m =>
    `<p style="margin:0 0 8px"><b>${m.role === "user" ? "Customer" : "Assistant"}:</b> ${esc(m.text)}</p>`).join("")}` : ""}
<p style="margin-top:24px;font-size:12px;color:#8a92a3">Lead ${esc(id)}. Sent by the Loveall Plumbing website. Kept for 24 months, then deleted automatically.</p>
</div>`;
  const text = rows.map(([k, v]) => `${k}: ${v}`).join("\n") +
    (transcript && transcript.length ? "\n\nChat conversation:\n" + transcript.map(m => `${m.role === "user" ? "Customer" : "Assistant"}: ${m.text}`).join("\n") : "") +
    `\n\nLead ${id}`;

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json", "idempotency-key": id },
      body: JSON.stringify({
        from: env.LEAD_FROM,
        to: [env.LEAD_TO],
        ...(env.LEAD_BCC && env.LEAD_BCC.toLowerCase() !== env.LEAD_TO.toLowerCase() ? { bcc: [env.LEAD_BCC] } : {}),
        subject: `New lead: ${lead.name}${lead.service ? " – " + lead.service : ""}${lead.urgency === "emergency" ? " (EMERGENCY)" : ""}`,
        html, text,
      }),
    });
    const data = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, id: data.id } : { ok: false, error: `${r.status} ${data.message || ""}`.slice(0, 300) };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 300) };
  }
}
