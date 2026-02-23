// src/net/wsClient.js
import { setState } from "../state/store.js";
import { getWinner, isBoardFull } from "../util/ttt.js";

export function createWsClient({ wsUrl, onError }) {
  let ws = null;

  function connect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return ws;

    ws = new WebSocket(wsUrl);

    ws.addEventListener("open", () => {
      setState(s => { s.online.status = "connected"; });
    });

    ws.addEventListener("close", () => {
      setState(s => {
        s.online.status = "disconnected";
        s.online.roomCode = null;
        s.online.role = null;
        s.online.myName = null;
        s.online.mySymbol = null;
        s.online.players = [];
        s.online.spectators = [];
        s.online.scores = [];
        s.online.lastResult = null;
        s.online.lastMove = null;
        s.online.lastMoveTickSeen = 0;
      });
    });

    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);

      if (msg.type === "error") {
        onError?.(msg.message);
        return;
      }

      if (msg.type === "room_created" || msg.type === "room_joined") {
        setState(s => {
          s.online.roomCode = msg.roomCode;
          s.online.role = msg.role;
          s.online.myName = msg.name; // server final name (unique)
        });
        return;
      }

      if (msg.type === "state") {
        setState(s => {
          s.online.roomCode = msg.roomCode;
          s.board = msg.board;
          s.online.turn = msg.turn;
          s.online.status = msg.status;
          s.online.players = msg.players || [];
          s.online.spectators = msg.spectators || [];
          s.online.scores = msg.scores || [];
          s.online.lastResult = msg.lastResult;
          s.online.lastMove = msg.lastMove;

          // compute my symbol from myName match
          if (s.online.role === "player" && s.online.myName) {
            const match = s.online.players.find(p => p.name.toLowerCase() === s.online.myName.toLowerCase());
            s.online.mySymbol = match?.symbol ?? s.online.mySymbol;
          } else {
            s.online.mySymbol = null;
          }

          const winner = getWinner(s.board);
          s.gameOver = (s.online.status === "over") || !!winner || isBoardFull(s.board);
        });
      }
    });

    return ws;
  }

  function send(obj) {
    connect();
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
      return true;
    }
    return false;
  }

  function sendWithRetry(obj) {
    const ok = send(obj);
    if (ok) return;
    setTimeout(() => send(obj), 200);
  }

  return { connect, send, sendWithRetry };
}