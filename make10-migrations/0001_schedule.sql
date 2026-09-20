CREATE TABLE make10_puzzles (
  ruleset TEXT NOT NULL CHECK (ruleset = 'basic-v1'),
  sequence_index INTEGER NOT NULL CHECK (typeof(sequence_index) = 'integer' AND sequence_index BETWEEN 0 AND 6890),
  puzzle_code TEXT NOT NULL CHECK (typeof(puzzle_code) = 'text' AND length(puzzle_code) = 4 AND puzzle_code NOT GLOB '*[^0-9]*'),
  PRIMARY KEY (ruleset, sequence_index),
  UNIQUE (ruleset, puzzle_code)
);

CREATE TABLE make10_sequence_metadata (
  ruleset TEXT PRIMARY KEY NOT NULL CHECK (ruleset = 'basic-v1'),
  puzzle_count INTEGER NOT NULL CHECK (puzzle_count = 6891),
  sequence_sha256 TEXT NOT NULL CHECK (length(sequence_sha256) = 64 AND sequence_sha256 NOT GLOB '*[^0-9a-f]*'),
  generated_at TEXT NOT NULL,
  seeded_at TEXT NOT NULL
);

-- A seeded schedule is immutable. No application route writes to these tables.
CREATE TRIGGER make10_puzzles_no_update BEFORE UPDATE ON make10_puzzles
BEGIN SELECT RAISE(ABORT, 'Make 10 schedule is immutable'); END;
CREATE TRIGGER make10_puzzles_no_delete BEFORE DELETE ON make10_puzzles
BEGIN SELECT RAISE(ABORT, 'Make 10 schedule is immutable'); END;
CREATE TRIGGER make10_puzzles_sealed BEFORE INSERT ON make10_puzzles
WHEN EXISTS (SELECT 1 FROM make10_sequence_metadata)
BEGIN SELECT RAISE(ABORT, 'Make 10 schedule is already seeded'); END;
CREATE TRIGGER make10_metadata_no_update BEFORE UPDATE ON make10_sequence_metadata
BEGIN SELECT RAISE(ABORT, 'Make 10 metadata is immutable'); END;
CREATE TRIGGER make10_metadata_no_delete BEFORE DELETE ON make10_sequence_metadata
BEGIN SELECT RAISE(ABORT, 'Make 10 metadata is immutable'); END;
CREATE TRIGGER make10_metadata_complete BEFORE INSERT ON make10_sequence_metadata
WHEN (SELECT COUNT(*) FROM make10_puzzles WHERE ruleset = NEW.ruleset) != 6891
BEGIN SELECT RAISE(ABORT, 'Make 10 schedule is incomplete'); END;
