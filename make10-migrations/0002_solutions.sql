CREATE TABLE make10_players (
  player_id TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE make10_solution_methods (
  ruleset TEXT NOT NULL,
  sequence_index INTEGER NOT NULL,
  method_hash TEXT NOT NULL CHECK (length(method_hash) = 64),
  canonical_method TEXT NOT NULL,
  display_expression TEXT NOT NULL,
  first_discovered_at TEXT NOT NULL,
  first_player_id TEXT NOT NULL REFERENCES make10_players(player_id),
  PRIMARY KEY (ruleset, sequence_index, method_hash),
  UNIQUE (ruleset, sequence_index, canonical_method),
  FOREIGN KEY (ruleset, sequence_index) REFERENCES make10_puzzles(ruleset, sequence_index)
);

CREATE TABLE make10_player_methods (
  player_id TEXT NOT NULL REFERENCES make10_players(player_id),
  ruleset TEXT NOT NULL,
  sequence_index INTEGER NOT NULL,
  method_hash TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  PRIMARY KEY (player_id, ruleset, sequence_index, method_hash),
  FOREIGN KEY (ruleset, sequence_index, method_hash)
    REFERENCES make10_solution_methods(ruleset, sequence_index, method_hash)
);

CREATE INDEX make10_method_players ON make10_player_methods(ruleset, sequence_index, method_hash);
-- Method PK covers puzzle lookups; player-method PK covers one player's puzzle.
