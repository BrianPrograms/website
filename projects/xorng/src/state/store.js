// src/state/store.js
export const state = {
  // local/online shared
  board: Array(9).fill(""),
  gameOver: false,

  // local-only
  localTurn: "X",
    localLastMove: null, // { index: number, tick: number } | null

  // online
  online: {
    status: "disconnected", // disconnected | waiting | playing | over | connected
    roomCode: null,
    role: null,             // player | spectator | null
    myName: null,           // server-approved unique name
    mySymbol: null,         // X | O | null
    turn: "X",
    players: [],
    spectators: [],
    scores: [],
    lastResult: null,
    lastMove: null,
    lastMoveTickSeen: 0,
  }
};

const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setState(patchFn) {
  patchFn(state);
  for (const fn of listeners) fn(state);
}