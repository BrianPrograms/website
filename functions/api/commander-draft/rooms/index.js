export async function onRequestPost(context) {
  try {
    const db = context.env.commander_draft_db;
    await cleanupExpiredRooms(db);
    const body = await context.request.json();

    const playerNames = body.playerNames || [
      "Player 1",
      "Player 2",
      "Player 3",
      "Player 4",
    ];

    const pool = body.pool || [];
    const commanders = body.commanders || [];
    const finalDeckSize = Number(body.finalDeckSize || 100);
    const includeBanned = Boolean(body.includeBanned);

    if (!Array.isArray(pool) || pool.length === 0) {
      return Response.json(
        { ok: false, error: "Missing draft pool." },
        { status: 400 }
      );
    }

    if (!Array.isArray(commanders) || commanders.length < 6) {
      return Response.json(
        { ok: false, error: "Room needs at least 6 commanders." },
        { status: 400 }
      );
    }

    const roomCode = await makeUniqueRoomCode(db);

    await db.prepare(`
      INSERT INTO draft_rooms (
        room_code,
        phase,
        pool_json,
        commanders_json,
        picked_ids_json,
        current_turn,
        draft_round,
        pick_index,
        final_deck_size,
        include_banned
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      roomCode,
      "commander_selection",
      JSON.stringify(pool),
      JSON.stringify(commanders),
      JSON.stringify([]),
      0,
      0,
      0,
      finalDeckSize,
      includeBanned ? 1 : 0
    ).run();

    for (let i = 0; i < 4; i++) {
      await db.prepare(`
        INSERT INTO draft_players (
          room_code,
          player_index,
          name,
          picks_json,
          retired,
          land_split_json
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        roomCode,
        i,
        playerNames[i] || `Player ${i + 1}`,
        JSON.stringify([]),
        0,
        JSON.stringify({})
      ).run();
    }

    return Response.json({
      ok: true,
      roomCode,
    });
  } catch (err) {
    return Response.json(
      { ok: false, error: err.message },
      { status: 500 }
    );
  }
}

async function makeUniqueRoomCode(db) {
  for (let i = 0; i < 20; i++) {
    const code = makeRoomCode();

    const existing = await db.prepare(`
      SELECT room_code
      FROM draft_rooms
      WHERE room_code = ?
    `).bind(code).first();

    if (!existing) {
      return code;
    }
  }

  throw new Error("Could not generate a unique room code.");
}

function makeRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }

  return code;
}

async function cleanupExpiredRooms(db) {
  await db.prepare(`
    DELETE FROM draft_players
    WHERE room_code IN (
      SELECT room_code
      FROM draft_rooms
      WHERE updated_at < datetime('now', '-30 days')
    )
  `).run();

  await db.prepare(`
    DELETE FROM draft_rooms
    WHERE updated_at < datetime('now', '-30 days')
  `).run();
}