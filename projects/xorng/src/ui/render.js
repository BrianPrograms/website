// src/ui/render.js
import { getWinner, isBoardFull, getWinningLine } from "../util/ttt.js";

export function createRenderer(els) {
  const {
    boardEl, statusEl, roomInfoEl,
    playersPanelEl, scoreboardEl,
    modeEl
  } = els;

  let lastOnlineRevealTickSeen = 0;
  let lastLocalRevealTickSeen = 0;

  function canClickOnline(state) {
    const o = state.online;
    if (modeEl.value !== "online") return true;
    if (o.role !== "player") return false;
    if (o.status !== "playing") return false;
    if (!o.mySymbol) return false;
    if (o.mySymbol !== o.turn) return false;
    return true;
  }

  function findTurnName(state) {
    const p = state.online.players.find(p => p.symbol === state.online.turn);
    return p?.name || state.online.turn;
  }

  function statusText(state) {
    if (modeEl.value !== "online") {
      const winner = getWinner(state.board);
      if (winner) return `Winner: ${winner}`;
      if (isBoardFull(state.board)) return "Draw!";
      return `Turn: ${state.localTurn} (${modeEl.value})`;
    }

    const o = state.online;
    if (o.status === "disconnected") return "Online: not connected";
    if (!o.roomCode) return "Online: connect + create/join a room";

    if (o.status === "waiting") {
      if (o.role === "player") {
        return `Room ${o.roomCode} | You: ${o.myName ?? "(joining…)"} | Waiting for opponent…`;
      }
      return `Room ${o.roomCode} | Spectating | Waiting for players…`;
    }

    if (o.status === "playing") {
      const turnName = findTurnName(state);
      if (o.role === "player" && !o.mySymbol) return `Room ${o.roomCode} | Assigning symbols…`;
      return `Room ${o.roomCode} | ${turnName}'s turn`;
    }

    if (o.status === "over") {
      if (o.lastResult?.winner) {
        const winnerName = o.players.find(p => p.symbol === o.lastResult.winner)?.name || o.lastResult.winner;
        return `Game over — ${winnerName} wins. (Reset randomizes starter)`;
      }
      if (o.lastResult?.draw) return "Game over — Draw. (Reset randomizes starter)";
      return "Game over.";
    }

    return `Room ${o.roomCode}`;
  }

  function computeRevealIndices(state) {
  // Online reveal
    if (modeEl.value === "online") {
      const lm = state.online.lastMove;
      if (!lm || !lm.tick) return new Set();
      if (lm.tick <= lastOnlineRevealTickSeen) return new Set();

      lastOnlineRevealTickSeen = lm.tick;
      return new Set([lm.index]);
    }

  // Local reveal
    const lm = state.localLastMove;
    if (!lm || !lm.tick) return new Set();
    if (lm.tick <= lastLocalRevealTickSeen) return new Set();

    lastLocalRevealTickSeen = lm.tick;
    return new Set([lm.index]);
  }

  function renderPlayers(state) {
    const o = state.online;
    playersPanelEl.innerHTML = "";

    const youLower = (o.myName || "").toLowerCase();

    for (const sym of ["X", "O"]) {
      const p = o.players.find(pp => pp.symbol === sym) || null;

      const row = document.createElement("div");
      row.className = "player-row";
      const isActive = (o.status === "playing" && o.turn === sym);
      if (isActive) row.classList.add("active");
      if (!p) row.classList.add("waiting");

      const left = document.createElement("div");
      left.className = "player-left";

      const icon = document.createElement("div");
      icon.className = "icon";
      icon.textContent = sym;

      const nameWrap = document.createElement("div");
      nameWrap.style.minWidth = "0";

      const nameLine = document.createElement("div");
      nameLine.className = "name";
      nameLine.textContent = p ? p.name : "Waiting…";

      const metaLine = document.createElement("div");
      metaLine.className = "score-line";
      metaLine.textContent = isActive && p ? "Turn" : " ";

      nameWrap.appendChild(nameLine);
      nameWrap.appendChild(metaLine);

      left.appendChild(icon);
      left.appendChild(nameWrap);

      const right = document.createElement("div");
      right.style.display = "flex";
      right.style.alignItems = "center";
      right.style.gap = "8px";

      if (p && p.name.toLowerCase() === youLower) {
        const you = document.createElement("span");
        you.className = "you-badge";
        you.textContent = "You";
        right.appendChild(you);
      }

      row.appendChild(left);
      row.appendChild(right);
      playersPanelEl.appendChild(row);
    }

    const spec = document.createElement("div");
    spec.className = "score-line";
    spec.style.marginTop = "10px";
    spec.textContent = `Spectators: ${o.spectators.length}`;
    playersPanelEl.appendChild(spec);
  }

  function renderScoreboard(state) {
    const o = state.online;
    scoreboardEl.innerHTML = "";

    if (modeEl.value !== "online" || !o.roomCode) {
      scoreboardEl.innerHTML = `<div class="score-line">Switch to Online mode to see scores.</div>`;
      return;
    }

    if (!o.scores || o.scores.length === 0) {
      scoreboardEl.innerHTML = `<div class="score-line">No scores yet.</div>`;
      return;
    }

    for (const s of o.scores) {
      const row = document.createElement("div");
      row.className = "score-row";

      const left = document.createElement("div");
      left.style.minWidth = "0";

      const top = document.createElement("div");
      top.className = "name";
      top.textContent = s.name;

      const line = document.createElement("div");
      line.className = "score-line";
      line.textContent = `W ${s.wins}  •  L ${s.losses}  •  D ${s.draws}`;

      left.appendChild(top);
      left.appendChild(line);

      const right = document.createElement("div");
      right.className = "badge";
      right.textContent = `${s.wins}W`;

      row.appendChild(left);
      row.appendChild(right);
      scoreboardEl.appendChild(row);
    }
  }

function renderBoard(state, { onCellClick }) {
  const reveal = computeRevealIndices(state);

  const winLine = getWinningLine(state.board);
  const winSet = (state.gameOver && winLine) ? new Set(winLine) : new Set();

  boardEl.innerHTML = "";
  for (let i = 0; i < 9; i++) {
    const btn = document.createElement("button");
    btn.className = "cell";
    btn.textContent = state.board[i];
    btn.addEventListener("click", () => onCellClick(i));

    if (reveal.has(i)) btn.classList.add("reveal");
    if (winSet.has(i)) btn.classList.add("win");

    if (state.gameOver) btn.disabled = true;
    if (modeEl.value === "online" && !canClickOnline(state)) btn.disabled = true;

    boardEl.appendChild(btn);
  }
}

  function renderAll(state, callbacks, options = {}) {
    roomInfoEl.textContent = (modeEl.value === "online" && state.online.roomCode) ? `Room: ${state.online.roomCode}` : "";
    statusEl.textContent = statusText(state);

    renderBoard(state, { ...callbacks, animateIndex: options.animateIndex ?? null });

    if (modeEl.value === "online") {
      renderPlayers(state);
      renderScoreboard(state);
    } else {
      playersPanelEl.innerHTML = `<div class="score-line">Switch to Online mode to see players.</div>`;
      scoreboardEl.innerHTML = `<div class="score-line">Switch to Online mode to see scores.</div>`;
    }
  }

  return { renderAll };
}