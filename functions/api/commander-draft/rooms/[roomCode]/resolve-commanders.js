export async function onRequestPost(context) {
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

    if (room.phase !== "commander_selection") {
      return Response.json(
        { ok: false, error: "Commanders have already been resolved." },
        { status: 400 }
      );
    }

    const playersResult = await db.prepare(`
      SELECT *
      FROM draft_players
      WHERE room_code = ?
      ORDER BY player_index ASC
    `).bind(roomCode).all();

    const players = playersResult.results;

    const missingPlayer = players.find(player => !player.commander_selection_id);

    if (missingPlayer) {
      return Response.json(
        {
          ok: false,
          error: `${missingPlayer.name} has not selected a commander.`,
        },
        { status: 400 }
      );
    }

    const commanders = JSON.parse(room.commanders_json);
    const commanderById = Object.fromEntries(
      commanders.map(card => [card.id, card])
    );

    const selectedGroups = {};

    for (const player of players) {
      const commanderId = player.commander_selection_id;

      if (!selectedGroups[commanderId]) {
        selectedGroups[commanderId] = [];
      }

      selectedGroups[commanderId].push(player);
    }

    const chosenCommanderIds = new Set(
      players.map(player => player.commander_selection_id)
    );

    const pickedIds = new Set(JSON.parse(room.picked_ids_json));
    const punishedPlayers = [];
    const assignments = [];

    for (const [commanderId, groupedPlayers] of Object.entries(selectedGroups)) {
      if (groupedPlayers.length === 1) {
        const player = groupedPlayers[0];

        assignments.push({
          player,
          commanderId,
          punished: false,
        });

        pickedIds.add(commanderId);
      } else {
        for (const player of groupedPlayers) {
          punishedPlayers.push(player);
        }

        pickedIds.add(commanderId);
      }
    }

    const fallbackCommanders = commanders.filter(
      commander =>
        !chosenCommanderIds.has(commander.id) &&
        !pickedIds.has(commander.id)
    );

    shuffle(fallbackCommanders);

    if (fallbackCommanders.length < punishedPlayers.length) {
      return Response.json(
        {
          ok: false,
          error: "Not enough fallback commanders. Regenerate the room.",
        },
        { status: 400 }
      );
    }

    for (const player of punishedPlayers) {
      const assigned = fallbackCommanders.pop();

      assignments.push({
        player,
        commanderId: assigned.id,
        punished: true,
      });

      pickedIds.add(assigned.id);
    }

    for (const assignment of assignments) {
      await db.prepare(`
        UPDATE draft_players
        SET commander_id = ?
        WHERE room_code = ?
        AND player_index = ?
      `).bind(
        assignment.commanderId,
        roomCode,
        assignment.player.player_index
      ).run();
    }

    await db.prepare(`
      UPDATE draft_rooms
      SET
        phase = ?,
        picked_ids_json = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE room_code = ?
    `).bind(
      "draft",
      JSON.stringify([...pickedIds]),
      roomCode
    ).run();

    return Response.json({
      ok: true,
      results: assignments.map(assignment => ({
        playerIndex: assignment.player.player_index,
        playerName: assignment.player.name,
        commanderId: assignment.commanderId,
        commanderName: commanderById[assignment.commanderId]?.name || "Unknown",
        punished: assignment.punished,
      })),
    });
  } catch (err) {
    return Response.json(
      { ok: false, error: err.message },
      { status: 500 }
    );
  }
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}