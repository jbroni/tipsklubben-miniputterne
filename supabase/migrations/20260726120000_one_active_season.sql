-- Enforce at most one active season at the database level.
-- Partial unique index on is_active WHERE is_active = true ensures only one season can have is_active = true.

-- One-time data repair: if the database has multiple active seasons (from old non-atomic behavior or manual edits),
-- deactivate all but the most recent one (by start_date DESC, then created_at DESC).
-- This UPDATE is naturally idempotent: it will match zero rows if only one or zero seasons are active.
UPDATE seasons SET is_active = false
WHERE is_active = true
  AND id <> (SELECT id FROM seasons WHERE is_active = true
             ORDER BY start_date DESC, created_at DESC LIMIT 1);

-- Create the unique constraint index without IF NOT EXISTS to fail loudly if a pre-existing index
-- of that name exists with a different definition.
CREATE UNIQUE INDEX seasons_one_active_idx ON seasons (is_active) WHERE is_active = true;
