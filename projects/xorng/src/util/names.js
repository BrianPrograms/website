// src/util/names.js
function makeShortId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 4; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export function getStoredName() {
  return localStorage.getItem("ttt_name") || "";
}

export function setStoredName(name) {
  localStorage.setItem("ttt_name", name);
}

export function ensureNameFilled(inputEl) {
  let n = (inputEl.value || "").trim();
  if (!n) {
    n = `Player-${makeShortId()}`;
    inputEl.value = n;
  }
  setStoredName(n);
  return n;
}