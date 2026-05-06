export async function onRequestPost(context) {
  try {
    const db = context.env.commander_draft_db;
    const roomCode = context.params.roomCode.toUpperCase();
    const body = await context.request.json();

    const playerIndex = Number(body.playerIndex);
    const cardId = body.cardId;

    if (Number.isNaN(playerIndex) || playerIndex < 0 || playerIndex > 3) {
      return Response.json(
        { ok: false, error: "Invalid player index." },
        { status: 400 }
      );
    }

    if (!cardId) {
      return Response.json(
        { ok: false, error: "Missing card id." },
        { status: 400 }
      );
    }

    const state = await loadRoomState(db, roomCode);

    if (!state) {
      return Response.json(
        { ok: false, error: "Room not found." },
        { status: 404 }
      );
    }

    if (state.room.phase !== "draft") {
      return Response.json(
        { ok: false, error: "Room is not currently drafting." },
        { status: 400 }
      );
    }

    const currentPlayer = getCurrentDraftPlayer(state);

    if (!currentPlayer) {
      return Response.json(
        { ok: false, error: "Draft is already finished." },
        { status: 400 }
      );
    }

    if (currentPlayer.player_index !== playerIndex) {
      return Response.json(
        {
          ok: false,
          error: `It is currently ${currentPlayer.name}'s turn.`,
        },
        { status: 400 }
      );
    }

    const card = state.pool.find(card => card.id === cardId);

    if (!card) {
      return Response.json(
        { ok: false, error: "Card is not in this room's pool." },
        { status: 400 }
      );
    }

    if (state.pickedIds.has(cardId)) {
      return Response.json(
        { ok: false, error: "Card has already been picked." },
        { status: 400 }
      );
    }

    const commander = state.pool.find(card => card.id === currentPlayer.commander_id)
      || state.commanders.find(card => card.id === currentPlayer.commander_id);

    if (!commander) {
      return Response.json(
        { ok: false, error: "Current player has no commander." },
        { status: 400 }
      );
    }

    if (!isLegalForCommander(card, commander)) {
      return Response.json(
        { ok: false, error: "Card is illegal for this commander's colour identity." },
        { status: 400 }
      );
    }

    const picks = JSON.parse(currentPlayer.picks_json);
    const nonCommanderTarget = state.room.final_deck_size - 1;

    if (picks.length >= nonCommanderTarget) {
      return Response.json(
        { ok: false, error: "This player has already reached the deck size limit." },
        { status: 400 }
      );
    }

    picks.push(card);

    state.pickedIds.add(cardId);

    const nextPosition = getNextTurnPosition(state);

    await db.prepare(`
      UPDATE draft_players
      SET picks_json = ?
      WHERE room_code = ?
      AND player_index = ?
    `).bind(
      JSON.stringify(picks),
      roomCode,
      playerIndex
    ).run();

    await db.prepare(`
      UPDATE draft_rooms
      SET
        picked_ids_json = ?,
        draft_round = ?,
        pick_index = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE room_code = ?
    `).bind(
      JSON.stringify([...state.pickedIds]),
      nextPosition.draftRound,
      nextPosition.pickIndex,
      roomCode
    ).run();

    return Response.json({
      ok: true,
      picked: card.name,
      next: {
        draftRound: nextPosition.draftRound,
        pickIndex: nextPosition.pickIndex,
      },
    });
  } catch (err) {
    return Response.json(
      { ok: false, error: err.message },
      { status: 500 }
    );
  }
}

async function loadRoomState(db, roomCode) {
  const room = await db.prepare(`
    SELECT *
    FROM draft_rooms
    WHERE room_code = ?
  `).bind(roomCode).first();

  if (!room) return null;

  const playersResult = await db.prepare(`
    SELECT *
    FROM draft_players
    WHERE room_code = ?
    ORDER BY player_index ASC
  `).bind(roomCode).all();

  return {
    room,
    players: playersResult.results,
    pool: JSON.parse(room.pool_json),
    commanders: JSON.parse(room.commanders_json),
    pickedIds: new Set(JSON.parse(room.picked_ids_json)),
    draftRound: room.draft_round,
    pickIndex: room.pick_index,
  };
}

function getCurrentDraftPlayer(state) {
  const order = getCurrentPickOrder(state.players.length, state.draftRound);
  let draftRound = state.draftRound;
  let pickIndex = state.pickIndex;

  for (let attempts = 0; attempts < state.players.length; attempts++) {
    const playerIndex = order[pickIndex];
    const player = state.players.find(p => p.player_index === playerIndex);

    if (!player.retired && getLegalAvailableCards(state, player).length > 0) {
      return player;
    }

    const next = advanceTurn(state.players.length, draftRound, pickIndex);
    draftRound = next.draftRound;
    pickIndex = next.pickIndex;
  }

  return null;
}

function getNextTurnPosition(state) {
  let draftRound = state.draftRound;
  let pickIndex = state.pickIndex;

  const next = advanceTurn(state.players.length, draftRound, pickIndex);
  draftRound = next.draftRound;
  pickIndex = next.pickIndex;

  for (let attempts = 0; attempts < state.players.length; attempts++) {
    const order = getCurrentPickOrder(state.players.length, draftRound);
    const playerIndex = order[pickIndex];
    const player = state.players.find(p => p.player_index === playerIndex);

    if (!player.retired && getLegalAvailableCards(state, player).length > 0) {
      return { draftRound, pickIndex };
    }

    const advanced = advanceTurn(state.players.length, draftRound, pickIndex);
    draftRound = advanced.draftRound;
    pickIndex = advanced.pickIndex;
  }

  return { draftRound, pickIndex };
}

function advanceTurn(playerCount, draftRound, pickIndex) {
  pickIndex++;

  if (pickIndex >= playerCount) {
    pickIndex = 0;
    draftRound++;
  }

  return { draftRound, pickIndex };
}

function getCurrentPickOrder(playerCount, draftRound) {
  const order = [...Array(playerCount).keys()];

  if (draftRound % 2 === 1) {
    order.reverse();
  }

  return order;
}

function getLegalAvailableCards(state, player) {
  const commander = state.pool.find(card => card.id === player.commander_id)
    || state.commanders.find(card => card.id === player.commander_id);

  if (!commander) return [];

  const picks = JSON.parse(player.picks_json);
  const nonCommanderTarget = state.room.final_deck_size - 1;

  if (picks.length >= nonCommanderTarget) {
    return [];
  }

  return state.pool.filter(card =>
    !state.pickedIds.has(card.id) &&
    isLegalForCommander(card, commander)
  );
}

function isLegalForCommander(card, commander) {
  const cardColors = card.color_identity || [];
  const commanderColors = commander.color_identity || [];

  return cardColors.every(color => commanderColors.includes(color));
}