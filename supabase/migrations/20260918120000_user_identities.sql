-- Create user_identities table to track retired auth identities
CREATE TABLE user_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  auth_id text NOT NULL UNIQUE,
  email text NOT NULL,
  -- timestamp(3) matches Prisma's default native mapping for DateTime on
  -- PostgreSQL; using timestamptz here would show up as drift on migrate diff.
  created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_identities_user_id FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE
);

-- Create index on user_id for efficient lookups by user
CREATE INDEX idx_user_identities_user_id ON user_identities (user_id);

-- Enable Row Level Security
ALTER TABLE public.user_identities ENABLE ROW LEVEL SECURITY;
