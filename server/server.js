// server.js — polished multiplayer
const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;

// roomCode -> room
// room = {
//   clients: Set(ws),
//   players: Map(ws -> {id, name, symbol}),
//   spectators: Map(ws -> {id, name}),
//   board: string[9],
//   turn: "X"|"O",
//   status: "waiting"|"playing"|"over",
//   lastResult: { winner: "X"|"O"|null, draw: boolean } | null,
//   lastMove: { index: number, tick: number } | null,
//   scores: Map(nameLower -> { name, wins, losses, draws })
// }
const rooms = new Map();

// lightweight sticky identity: roomCode:nameLower -> { symbol }
const stickyIdentity = new Map();

function makeRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function makeShortId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 4; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function randomMark() {
  const r = Math.floor(Math.random() * 3);
  return r === 0 ? "X" : r === 1 ? "O" : "";
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getWinner(b) {
  const lines = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6],
  ];
  for (const [a,c,d] of lines) {
    if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  }
  return null;
}

function isBoardFull(b) {
  return b.every(v => v !== "");
}

function safeSend(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function broadcastRoom(roomCode, obj) {
  const room = rooms.get(roomCode);
  if (!room) return;
  for (const ws of room.clients) safeSend(ws, obj);
}

function createRoom() {
  let code;
  do code = makeRoomCode();
  while (rooms.has(code));

  rooms.set(code, {
    clients: new Set(),
    players: new Map(),
    spectators: new Map(),
    board: Array(9).fill(""),
    turn: "X",
    status: "waiting",
    lastResult: null,
    lastMove: null,
    scores: new Map(),
  });
  return code;
}

function normalizeName(name) {
  const n = String(name || "").trim();
  // if empty, generate Player-XXXX
  if (!n) return `Player-${makeShortId()}`;
  // keep it short and safe-ish
  const clipped = n.slice(0, 16);
  return clipped || `Player-${makeShortId()}`;
}

function roomHasName(room, nameLower) {
  for (const p of room.players.values()) {
    if (p.name.toLowerCase() === nameLower) return true;
  }
  for (const s of room.spectators.values()) {
    if (s.name.toLowerCase() === nameLower) return true;
  }
  return false;
}

function makeUniqueName(room, desiredName) {
  let base = desiredName;
  let lower = base.toLowerCase();
  if (!roomHasName(room, lower)) return base;

  // If duplicate, append -XXXX until unique
  for (let tries = 0; tries < 50; tries++) {
    const candidate = `${base}-${makeShortId()}`.slice(0, 16);
    const candLower = candidate.toLowerCase();
    if (!roomHasName(room, candLower)) return candidate;
  }
  // fallback (shouldn't happen)
  return `${base}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`.slice(0, 16);
}

function ensureScore(room, name) {
  const key = name.toLowerCase();
  if (!room.scores.has(key)) {
    room.scores.set(key, { name, wins: 0, losses: 0, draws: 0 });
  } else {
    // keep the latest capitalization
    room.scores.get(key).name = name;
  }
  return room.scores.get(key);
}

function assignRandomSymbols(room) {
  const entries = [...room.players.entries()];
  if (entries.length !== 2) return;

  const symbols = shuffle(["X", "O"]);
  entries[0][1].symbol = symbols[0];
  entries[1][1].symbol = symbols[1];
  room.turn = "X"; // X starts; since X assigned randomly, starter is random
}

function finalizeScoresOnGameOver(room) {
  if (!room.lastResult) return;
  const players = [...room.players.values()];
  if (players.length !== 2) return;

  const pX = players.find(p => p.symbol === "X");
  const pO = players.find(p => p.symbol === "O");

  if (!pX || !pO) return;

  const sX = ensureScore(room, pX.name);
  const sO = ensureScore(room, pO.name);

  if (room.lastResult.draw) {
    sX.draws += 1;
    sO.draws += 1;
    return;
  }

  const w = room.lastResult.winner;
  if (w === "X") {
    sX.wins += 1;
    sO.losses += 1;
  } else if (w === "O") {
    sO.wins += 1;
    sX.losses += 1;
  }
}

function roomSnapshot(roomCode) {
  const room = rooms.get(roomCode);
  const players = [...room.players.values()].map(p => ({ id: p.id, name: p.name, symbol: p.symbol }));
  const spectators = [...room.spectators.values()].map(s => ({ id: s.id, name: s.name }));
  const scores = [...room.scores.values()]
    .sort((a, b) => (b.wins - a.wins) || (a.losses - b.losses) || a.name.localeCompare(b.name));

  return {
    type: "state",
    roomCode,
    board: room.board,
    turn: room.turn,
    status: room.status,
    lastResult: room.lastResult,
    lastMove: room.lastMove, // used for animation triggers
    players,
    spectators,
    scores,
  };
}

function cleanupEmptyRoom(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  if (room.clients.size === 0) rooms.delete(roomCode);
}

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("WebSocket server running.\n");
});

const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
  ws.id = Math.random().toString(36).slice(2, 10);
  ws.roomCode = null;
  ws.name = null;

  safeSend(ws, { type: "hello", clientId: ws.id });

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); }
    catch { return safeSend(ws, { type: "error", message: "Invalid JSON" }); }

    // Create room
    if (msg.type === "create_room") {
      const desired = normalizeName(msg.name);
      const roomCode = createRoom();
      const room = rooms.get(roomCode);

      const uniqueName = makeUniqueName(room, desired);

      ws.roomCode = roomCode;
      ws.name = uniqueName;
      room.clients.add(ws);

      room.players.set(ws, { id: ws.id, name: uniqueName, symbol: null });
      ensureScore(room, uniqueName);

      room.status = "waiting";
      room.lastResult = null;
      room.lastMove = null;

      safeSend(ws, { type: "room_created", roomCode, role: "player", name: uniqueName });
      broadcastRoom(roomCode, roomSnapshot(roomCode));
      return;
    }

    // Join room
    if (msg.type === "join_room") {
      const roomCode = String(msg.roomCode || "").toUpperCase().trim();
      const room = rooms.get(roomCode);
      if (!room) return safeSend(ws, { type: "error", message: "Room not found" });

      const desired = normalizeName(msg.name);
      const uniqueName = makeUniqueName(room, desired);

      ws.roomCode = roomCode;
      ws.name = uniqueName;
      room.clients.add(ws);

      ensureScore(room, uniqueName);

      const key = `${roomCode}:${uniqueName.toLowerCase()}`;
      const sticky = stickyIdentity.get(key);

      if (room.players.size < 2) {
        room.players.set(ws, { id: ws.id, name: uniqueName, symbol: sticky?.symbol ?? null });

        if (room.players.size === 2) {
          const vals = [...room.players.values()];
          const bothSet = vals.every(p => p.symbol === "X" || p.symbol === "O");
          if (!bothSet) assignRandomSymbols(room);

          for (const p of room.players.values()) {
            const k = `${roomCode}:${p.name.toLowerCase()}`;
            stickyIdentity.set(k, { symbol: p.symbol });
          }

          room.status = "playing";
          room.lastResult = null;
          room.lastMove = null;
        } else {
          room.status = "waiting";
        }

        safeSend(ws, { type: "room_joined", roomCode, role: "player", name: uniqueName });
      } else {
        room.spectators.set(ws, { id: ws.id, name: uniqueName });
        safeSend(ws, { type: "room_joined", roomCode, role: "spectator", name: uniqueName });
      }

      broadcastRoom(roomCode, roomSnapshot(roomCode));
      return;
    }

    // Must be in a room after this
    if (!ws.roomCode) return safeSend(ws, { type: "error", message: "Not in a room" });
    const roomCode = ws.roomCode;
    const room = rooms.get(roomCode);
    if (!room) return safeSend(ws, { type: "error", message: "Room missing" });

    // Reset (players only). Also re-randomize X/O again for a fresh starter.
    if (msg.type === "reset") {
      if (!room.players.has(ws)) return;

      room.board = Array(9).fill("");
      room.lastResult = null;
      room.lastMove = null;

      if (room.players.size === 2) {
        assignRandomSymbols(room);
        for (const p of room.players.values()) {
          const k = `${roomCode}:${p.name.toLowerCase()}`;
          stickyIdentity.set(k, { symbol: p.symbol });
        }
        room.status = "playing";
      } else {
        room.status = "waiting";
        room.turn = "X";
      }

      broadcastRoom(roomCode, roomSnapshot(roomCode));
      return;
    }

    // Move
    if (msg.type === "move") {
      if (room.status !== "playing") return;

      const me = room.players.get(ws);
      if (!me) return; // spectators can't move

      if (me.symbol !== room.turn) return;

      const idx = Number(msg.index);
      if (!Number.isInteger(idx) || idx < 0 || idx > 8) return;
      if (room.board[idx] !== "") return;

      // server-authoritative randomness
      room.board[idx] = randomMark();
      room.lastMove = { index: idx, tick: Date.now() };

      const winner = getWinner(room.board);
      if (winner) {
        room.status = "over";
        room.lastResult = { winner, draw: false };
        finalizeScoresOnGameOver(room);
      } else if (isBoardFull(room.board)) {
        room.status = "over";
        room.lastResult = { winner: null, draw: true };
        finalizeScoresOnGameOver(room);
      } else {
        room.turn = room.turn === "X" ? "O" : "X";
      }

      broadcastRoom(roomCode, roomSnapshot(roomCode));
      return;
    }

    safeSend(ws, { type: "error", message: "Unknown message type" });
  });

  ws.on("close", () => {
    const roomCode = ws.roomCode;
    if (!roomCode) return;

    const room = rooms.get(roomCode);
    if (!room) return;

    room.clients.delete(ws);
    room.players.delete(ws);
    room.spectators.delete(ws);

    room.status = room.players.size === 2 ? "playing" : "waiting";

    broadcastRoom(roomCode, roomSnapshot(roomCode));
    cleanupEmptyRoom(roomCode);
  });
});

server.listen(PORT, () => {
  console.log(`WebSocket server listening on ws://localhost:${PORT}`);
});