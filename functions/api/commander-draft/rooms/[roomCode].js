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