export async function onRequestGet(context) {
  const db = context.env.commander_draft_db;

  const result = await db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table'"
  ).all();

  return Response.json({
    ok: true,
    tables: result.results,
  });
}