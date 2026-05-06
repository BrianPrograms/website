export async function onRequestPost(context) {
  try {
    const db = context.env.commander_draft_db;
    const roomCode = context.params.roomCode.toUpperCase();
    const body = await context.request.json();

    const playerIndex = Number(body.playerIndex);

    if (Number.isNaN(playerIndex) || playerIndex < 0 || playerIndex > 3) {
      return Response.json(
        { ok: false, error: "Invalid player index." },
        { status: 400 }
      );
    }

    const room = await db.prepare(`
      SELECT phase
      FROM draft_rooms
      WHERE room_code = ?
    `).bind(roomCode).first();

    if (!room) {
      return Response.json(
        { ok: false, error: "Room not found." },
        { status: 404 }
      );
    }

    if (room.phase !== "draft") {
      return Response.json(
        { ok: false, error: "Room is not currently drafting." },
        { status: 400 }
      );
    }

    const result = await db.prepare(`
      UPDATE draft_players
      SET retired = 1
      WHERE room_code = ?
      AND player_index = ?
    `).bind(roomCode, playerIndex).run();

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