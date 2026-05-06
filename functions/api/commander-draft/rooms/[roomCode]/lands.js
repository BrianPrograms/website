export async function onRequestPost(context) {
  try {
    const db = context.env.commander_draft_db;
    const roomCode = context.params.roomCode.toUpperCase();
    const body = await context.request.json();

    const playerIndex = Number(body.playerIndex);
    const landSplit = body.landSplit || {};

    if (Number.isNaN(playerIndex) || playerIndex < 0 || playerIndex > 3) {
      return Response.json(
        { ok: false, error: "Invalid player index." },
        { status: 400 }
      );
    }

    if (typeof landSplit !== "object" || Array.isArray(landSplit)) {
      return Response.json(
        { ok: false, error: "Invalid land split." },
        { status: 400 }
      );
    }

    for (const [land, count] of Object.entries(landSplit)) {
      if (!isAllowedBasic(land)) {
        return Response.json(
          { ok: false, error: `${land} is not an allowed basic land.` },
          { status: 400 }
        );
      }

      if (!Number.isInteger(count) || count < 0) {
        return Response.json(
          { ok: false, error: `${land} must have a non-negative integer count.` },
          { status: 400 }
        );
      }
    }

    const result = await db.prepare(`
      UPDATE draft_players
      SET land_split_json = ?
      WHERE room_code = ?
      AND player_index = ?
    `).bind(
      JSON.stringify(landSplit),
      roomCode,
      playerIndex
    ).run();

    if (result.meta.changes === 0) {
      return Response.json(
        { ok: false, error: "Player not found." },
        { status: 404 }
      );
    }

    await db.prepare(`
      UPDATE draft_rooms
      SET updated_at = CURRENT_TIMESTAMP
      WHERE room_code = ?
    `).bind(roomCode).run();

    return Response.json({
      ok: true,
    });
  } catch (err) {
    return Response.json(
      { ok: false, error: err.message },
      { status: 500 }
    );
  }
}

function isAllowedBasic(name) {
  return [
    "Plains",
    "Island",
    "Swamp",
    "Mountain",
    "Forest",
    "Wastes",
  ].includes(name);
}