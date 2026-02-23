// app.js (module entry)
import { state, setState, subscribe } from "./src/state/store.js";
import { createWsClient } from "./src/net/wsClient.js";
import { ensureNameFilled, getStoredName, setStoredName } from "./src/util/names.js";
import { makeInviteLink, getRoomFromUrl } from "./src/util/invite.js";
import { randomMark, getWinner, isBoardFull } from "./src/util/ttt.js";
import { createRenderer } from "./src/ui/render.js";

// ---- DOM ----
const els = {
  boardEl: document.getElementById("board"),
  statusEl: document.getElementById("status"),
  resetBtn: document.getElementById("reset"),
  modeEl: document.getElementById("mode"),

  onlineControlsEl: document.getElementById("onlineControls"),
  createRoomBtn: document.getElementById("createRoom"),
  joinRoomBtn: document.getElementById("joinRoom"),
  copyRoomBtn: document.getElementById("copyRoom"),
  copyInviteBtn: document.getElementById("copyInvite"),
  roomCodeInput: document.getElementById("roomCode"),
  roomInfoEl: document.getElementById("roomInfo"),
  playerNameInput: document.getElementById("playerName"),

  playersPanelEl: document.getElementById("playersPanel"),
  scoreboardEl: document.getElementById("scoreboard"),
};

const renderer = createRenderer({
  boardEl: els.boardEl,
  statusEl: els.statusEl,
  roomInfoEl: els.roomInfoEl,
  playersPanelEl: els.playersPanelEl,
  scoreboardEl: els.scoreboardEl,
  modeEl: els.modeEl
});

// ---- WS client ----
const PROD_WS_HOST = "website-t3mu.onrender.com";

const WS_URL =
  location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "ws://localhost:8080"
    : `wss://${PROD_WS_HOST}`;
const wsClient = createWsClient({
  wsUrl: WS_URL,
  onError: (msg) => { els.statusEl.textContent = `Error: ${msg}`; }
});

// ---- Rendering subscription ----
subscribe((s) => {
  renderer.renderAll(s, { onCellClick });
});

// ---- Mode UI ----
function setModeUI() {
  const isOnline = els.modeEl.value === "online";
  els.onlineControlsEl.style.display = isOnline ? "flex" : "none";

  if (isOnline) {
    wsClient.connect();
    els.statusEl.textContent = "Online: connect + create/join a room";
  } else {
    resetLocal();
  }
}

// ---- Local gameplay ----
function resetLocal() {
  setState(s => {
    s.board = Array(9).fill("");
    s.localTurn = "X";
    s.localLastMove = null;
    s.gameOver = false;
  });
}

function applyLocalMove(i) {
  setState(s => {
    if (s.gameOver) return;
    if (s.board[i] !== "") return;

    s.board[i] = randomMark();
    s.localLastMove = { index: i, tick: Date.now() }; // <- important

    s.localTurn = s.localTurn === "X" ? "O" : "X";

    const winner = getWinner(s.board);
    if (winner || isBoardFull(s.board)) s.gameOver = true;
  });
}

function botMoveIfNeeded() {
  if (els.modeEl.value !== "bot") return;

  // Bot is "O" (localTurn indicates whose turn is next)
  if (state.gameOver) return;
  if (state.localTurn !== "O") return;

  const empties = state.board.map((v, idx) => (v === "" ? idx : null)).filter(v => v !== null);
  if (empties.length === 0) return;

  setTimeout(() => {
    const choice = empties[Math.floor(Math.random() * empties.length)];
    applyLocalMove(choice);
  }, 250);
}

// ---- Online actions ----
function createRoom() {
  const name = ensureNameFilled(els.playerNameInput);
  setStoredName(name);
  setState(s => { s.online.lastMoveTickSeen = 0; });
  wsClient.sendWithRetry({ type: "create_room", name });
}

function joinRoom(code) {
  const name = ensureNameFilled(els.playerNameInput);
  setStoredName(name);
  setState(s => { s.online.lastMoveTickSeen = 0; });
  wsClient.sendWithRetry({ type: "join_room", roomCode: code, name });
}

function resetOnline() {
  if (state.online.role !== "player") {
    els.statusEl.textContent = "Spectators can’t reset.";
    return;
  }
  wsClient.sendWithRetry({ type: "reset" });
}

function sendOnlineMove(i) {
  wsClient.send({ type: "move", index: i });
}

// ---- Shared cell click ----
function onCellClick(i) {
  if (els.modeEl.value === "online") {
    // let server validate turns; UI already disables invalid clicks
    sendOnlineMove(i);
    return;
  }

  applyLocalMove(i);
  botMoveIfNeeded();
}

// ---- Invite link ----
async function copyInviteLink() {
  if (!state.online.roomCode) return;
  const link = makeInviteLink(state.online.roomCode);
  try {
    await navigator.clipboard.writeText(link);
    els.statusEl.textContent = "Copied invite link!";
  } catch {
    els.statusEl.textContent = `Invite link: ${link}`;
  }
}

// ---- Wire events ----
els.createRoomBtn.addEventListener("click", createRoom);

els.joinRoomBtn.addEventListener("click", () => {
  const code = els.roomCodeInput.value.toUpperCase().trim();
  if (!code) return;
  joinRoom(code);
});

els.copyRoomBtn.addEventListener("click", async () => {
  if (!state.online.roomCode) return;
  try {
    await navigator.clipboard.writeText(state.online.roomCode);
    els.statusEl.textContent = `Copied room code: ${state.online.roomCode}`;
  } catch {
    els.statusEl.textContent = `Room code: ${state.online.roomCode} (copy failed—copy manually)`;
  }
});

els.copyInviteBtn.addEventListener("click", copyInviteLink);

els.resetBtn.addEventListener("click", () => {
  if (els.modeEl.value === "online") resetOnline();
  else resetLocal();
});

els.modeEl.addEventListener("change", () => {
  setState(s => { s.gameOver = false; });
  setModeUI();
});

els.playerNameInput.value = getStoredName();
els.playerNameInput.addEventListener("change", () => {
  setStoredName((els.playerNameInput.value || "").trim());
});

// ---- Auto-fill from invite link ----
function applyRoomFromUrl() {
  const room = getRoomFromUrl();
  if (!room) return;

  els.modeEl.value = "online";
  els.roomCodeInput.value = room;
  setModeUI();

  // Auto-join is optional. Current behavior: fill + focus join.
  els.joinRoomBtn.focus();

  // If you want auto-join, uncomment:
  // joinRoom(room);
}
applyRoomFromUrl();

// ---- Initial render ----
setModeUI();
renderer.renderAll(state, { onCellClick, onRevealSeen: () => {} });