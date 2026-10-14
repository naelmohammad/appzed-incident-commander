/**
 * AppZed incident-commander (managed=true). Open incidents, append timeline
 * entries, resolve with an AI-written incident review. Schema
 * self-initializes. Bindings: AI, DB (d1).
 */
const SCHEMA = "CREATE TABLE IF NOT EXISTS incidents (id TEXT PRIMARY KEY, title TEXT, severity TEXT DEFAULT 'pending', status TEXT DEFAULT 'open', review TEXT, created_at TEXT DEFAULT (datetime('now')), resolved_at TEXT); CREATE TABLE IF NOT EXISTS timeline (id INTEGER PRIMARY KEY AUTOINCREMENT, incident_id TEXT, entry TEXT, created_at TEXT DEFAULT (datetime('now')))";
const MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true, solution: "incident-commander" });
    }
    if (request.method === "POST" && url.pathname === "/incidents") {
      const body = await request.json().catch(() => null);
      if (!body || !body.title) return bad("incident title is required.");
      const id = crypto.randomUUID();
      await env.DB.exec(SCHEMA);
      await env.DB.prepare(
        "INSERT INTO incidents (id, title, severity) VALUES (?, ?, ?)"
      ).bind(id, body.title, body.severity || "pending").run();
      await env.DB.prepare(
        "INSERT INTO timeline (incident_id, entry) VALUES (?, ?)"
      ).bind(id, "Incident opened.").run();
      return Response.json({ id, status: "open" }, { status: 201 });
    }
    if (request.method === "GET" && url.pathname === "/incidents") {
      await env.DB.exec(SCHEMA);
      const rows = await env.DB.prepare(
        "SELECT * FROM incidents ORDER BY created_at DESC LIMIT 50"
      ).all();
      return Response.json({ incidents: rows.results || [] });
    }
    const append = url.pathname.match(/^\/incidents\/([^/]+)\/timeline$/);
    if (request.method === "POST" && append) {
      const body = await request.json().catch(() => null);
      if (!body || !body.entry) return bad("timeline entry is required.");
      const inc = await env.DB.prepare("SELECT id FROM incidents WHERE id = ?").bind(append[1]).first();
      if (!inc) return Response.json({ error: "not found" }, { status: 404 });
      await env.DB.prepare(
        "INSERT INTO timeline (incident_id, entry) VALUES (?, ?)"
      ).bind(append[1], String(body.entry).slice(0, 2000)).run();
      return Response.json({ incident_id: append[1], appended: true }, { status: 201 });
    }
    const one = url.pathname.match(/^\/incidents\/([^/]+)$/);
    if (request.method === "GET" && one) {
      const inc = await env.DB.prepare("SELECT * FROM incidents WHERE id = ?").bind(one[1]).first();
      if (!inc) return Response.json({ error: "not found" }, { status: 404 });
      const entries = await env.DB.prepare(
        "SELECT entry, created_at FROM timeline WHERE incident_id = ? ORDER BY id ASC"
      ).bind(one[1]).all();
      return Response.json({ ...inc, timeline: entries.results || [] });
    }
    const resolve = url.pathname.match(/^\/incidents\/([^/]+)\/resolve$/);
    if (request.method === "POST" && resolve) {
      const inc = await env.DB.prepare("SELECT * FROM incidents WHERE id = ?").bind(resolve[1]).first();
      if (!inc) return Response.json({ error: "not found" }, { status: 404 });
      if (inc.status === "resolved") return Response.json({ error: "already resolved" }, { status: 409 });
      const entries = await env.DB.prepare(
        "SELECT entry, created_at FROM timeline WHERE incident_id = ? ORDER BY id ASC"
      ).bind(resolve[1]).all();
      const log = (entries.results || []).map((e) => `[${e.created_at}] ${e.entry}`).join("\n").slice(0, 8000);
      let review = "";
      try {
        const out = await env.AI.run(MODEL, {
          messages: [
            { role: "system", content: "Write an incident review in three sections: WHAT HAPPENED (2-3 sentences), ROOT CAUSE (best-supported hypothesis, stated as such), FOLLOW-UPS (bulleted preventive actions). No blame language." },
            { role: "user", content: `Incident: ${inc.title} (severity ${inc.severity}).\n\nTimeline:\n${log}` },
          ],
          max_tokens: 512,
        });
        review = out.response || "";
      } catch (err) {
        return Response.json({ error: String((err && err.message) || err) }, { status: 502 });
      }
      await env.DB.prepare(
        "UPDATE incidents SET status = 'resolved', review = ?, resolved_at = datetime('now') WHERE id = ?"
      ).bind(review, resolve[1]).run();
      return Response.json({ id: resolve[1], status: "resolved", review });
    }
    return new Response("Not found", { status: 404 });
  },
};

function bad(message) {
  return Response.json({ error: message }, { status: 400 });
}
