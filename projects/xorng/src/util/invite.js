// src/util/invite.js
export function makeInviteLink(roomCode) {
  const url = new URL(window.location.href);
  url.searchParams.set("room", roomCode);
  return url.toString();
}

export function getRoomFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const room = (params.get("room") || "").toUpperCase().trim();
  return room || null;
}