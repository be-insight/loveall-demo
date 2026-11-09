// Daily retention job for loveall-leads: deletes leads older than 24 months,
// matching the retention period in the site's privacy policy.
const RETENTION = "-24 months";

async function purge(env) {
  const r = await env.DB.prepare(
    "DELETE FROM leads WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)"
  ).bind(RETENTION).run();
  const deleted = r.meta?.changes ?? 0;
  console.log(JSON.stringify({ job: "lead-cleanup", deleted, at: new Date().toISOString() }));
  return deleted;
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(purge(env));
  },
  // No public HTTP surface; the job only runs on its cron trigger.
  async fetch() {
    return new Response("Not found", { status: 404 });
  },
};
