-- A large comment history must not prevent an otherwise complete writing calculation.
-- This private fallback is populated only when the full collaboration backup is unavailable.
ALTER TABLE manuscript_snapshots ADD COLUMN writing_state jsonb;
