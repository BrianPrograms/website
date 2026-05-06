export async function onRequestGet(context) {
  try {
    const db = context.env.commander_draft_db;
    const roomCode = context.params.roomCode.toUpperCase();

    const room = await db.prepare(`
      SELECT *
      FROM draft_rooms
      WHERE room_code = ?
    `).bind(roomCode).first();

    if (!room) {
      return Response.json(
        { ok: false, error: "Room not found." },
        { status: 404 }
      );
    }

    if (isExpired(room)) {
      await deleteRoom(db, roomCode);

      return Response.json(
        { ok: false, error: "Room has expired after 30 days of inactivity." },
        { status: 410 }
      );
    }

    const players = await db.prepare(`
      SELECT *
      FROM draft_players
      WHERE room_code = ?
      ORDER BY player_index ASC
    `).bind(roomCode).all();

    return Response.json({
      ok: true,
      room: {
        roomCode: room.room_code,
        phase: room.phase,
        pool: JSON.parse(room.pool_json),
        commanders: JSON.parse(room.commanders_json),
        pickedIds: JSON.parse(room.picked_ids_json),
        currentTurn: room.current_turn,
        draftRound: room.draft_round,
        pickIndex: room.pick_index,
        finalDeckSize: room.final_deck_size,
        includeBanned: Boolean(room.include_banned),
        createdAt: room.created_at,
        updatedAt: room.updated_at,
        expiresAfterDays: 30,
        players: players.results.map(player => ({
          id: player.id,
          playerIndex: player.player_index,
          name: player.name,
          commanderId: player.commander_id,
          commanderSelectionId: player.commander_selection_id,
          picks: JSON.parse(player.picks_json),
          retired: Boolean(player.retired),
          landSplit: JSON.parse(player.land_split_json),
        })),
      },
    });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        error: err.message,
      },
      { status: 500 }
    );
  }
}

function isExpired(room) {
  const updatedAt = new Date(`${room.updated_at}Z`);
  const now = new Date();
  const expiryMs = 30 * 24 * 60 * 60 * 1000;

  return now - updatedAt > expiryMs;
}

async function deleteRoom(db, roomCode) {
  await db.prepare(`
    DELETE FROM draft_players
    WHERE room_code = ?
  `).bind(roomCode).run();

  await db.prepare(`
    DELETE FROM draft_rooms
    WHERE room_code = ?
  `).bind(roomCode).run();
}