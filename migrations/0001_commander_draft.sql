CREATE TABLE IF NOT EXISTS draft_rooms (
  room_code TEXT PRIMARY KEY,
  phase TEXT NOT NULL,
  pool_json TEXT NOT NULL,
  commanders_json TEXT NOT NULL,
  picked_ids_json TEXT NOT NULL,
  current_turn INTEGER NOT NULL DEFAULT 0,
  draft_round INTEGER NOT NULL DEFAULT 0,
  pick_index INTEGER NOT NULL DEFAULT 0,
  final_deck_size INTEGER NOT NULL DEFAULT 100,
  include_banned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS draft_players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_code TEXT NOT NULL,
  player_index INTEGER NOT NULL,
  name TEXT NOT NULL,
  commander_id TEXT,
  commander_selection_id TEXT,
  picks_json TEXT NOT NULL DEFAULT '[]',
  retired INTEGER NOT NULL DEFAULT 0,
  land_split_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (room_code) REFERENCES draft_rooms(room_code)
);

CREATE INDEX IF NOT EXISTS idx_draft_players_room
ON draft_players(room_code);