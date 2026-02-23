// src/util/ttt.js
export function randomMark() {
  const r = Math.floor(Math.random() * 3);
  return r === 0 ? "X" : r === 1 ? "O" : "";
}

export function getWinner(b) {
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

export function isBoardFull(b) {
  return b.every(v => v !== "");
}

export function getWinningLine(b) {
  const lines = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6],
  ];
  for (const line of lines) {
    const [a,c,d] = line;
    if (b[a] && b[a] === b[c] && b[a] === b[d]) return line;
  }
  return null;
}