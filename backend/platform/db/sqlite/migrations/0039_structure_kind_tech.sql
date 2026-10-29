-- A Structure component says what it is (kind, one of the canvas component kinds)
-- and what it is built with (tech, free text). Other levels keep both empty.
ALTER TABLE structure_nodes ADD COLUMN kind TEXT NOT NULL DEFAULT '';
ALTER TABLE structure_nodes ADD COLUMN tech TEXT NOT NULL DEFAULT '';
