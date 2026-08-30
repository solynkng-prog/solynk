-- Add the Supabase identity column to databases created before the Firebase migration.
-- Existing users must be mapped to their Supabase Auth UUIDs before this column
-- can be made NOT NULL.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS supabase_uid UUID;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'firebase_uid'
  ) THEN
    ALTER TABLE users ALTER COLUMN firebase_uid DROP NOT NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_supabase
  ON users(supabase_uid)
  WHERE supabase_uid IS NOT NULL;
