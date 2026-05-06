export async function onRequestPost(context) {
  try {
    const db = context.env.commander_draft_db;
    const roomCode = context.params.roomCode.toUpperCase();
    const body = await context.request.json();

    const playerIndex = Number(body.playerIndex);
    const commanderId = body.commanderId;

    if (Number.isNaN(playerIndex) || playerIndex < 0 || playerIndex > 3) {
      return Response.json(
        { ok: false, error: "Invalid player index." },
        { status: 400 }
      );
    }

    if (!commanderId) {
      return Response.json(
        { ok: false, error: "Missing commander id." },
        { status: 400 }
      );
    }

    const room = await db.prepare(`
      SELECT phase, commanders_json
      FROM draft_rooms
      WHERE room_code = ?
    `).bind(roomCode).first();

    if (!room) {
      return Response.json(
        { ok: false, error: "Room not found." },
        { status: 404 }
      );
    }

    if (room.phase !== "commander_selection") {
      return Response.json(
        { ok: false, error: "Commander selection is closed." },
        { status: 400 }
      );
    }

    const commanders = JSON.parse(room.commanders_json);
    const commanderExists = commanders.some(card => card.id === commanderId);

    if (!commanderExists) {
      return Response.json(
        { ok: false, error: "Commander is not available in this room." },
        { status: 400 }
      );
    }

    await db.prepare(`
      UPDATE draft_players
      SET commander_selection_id = ?
      WHERE room_code = ?
      AND player_index = ?
    `).bind(commanderId, roomCode, playerIndex).run();

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