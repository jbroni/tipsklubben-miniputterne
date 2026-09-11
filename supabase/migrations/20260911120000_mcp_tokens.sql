-- Create mcp_tokens table
CREATE TABLE mcp_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  token_prefix text NOT NULL,
  -- timestamp(3) matches Prisma's default native mapping for DateTime on
  -- PostgreSQL; using timestamptz here would show up as drift on migrate diff.
  created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at timestamp(3),
  revoked_at timestamp(3),
  CONSTRAINT fk_mcp_tokens_user_id FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE
);

-- Create index on user_id for efficient lookups by user
CREATE INDEX idx_mcp_tokens_user_id ON mcp_tokens (user_id);

-- Enable Row Level Security
ALTER TABLE public.mcp_tokens ENABLE ROW LEVEL SECURITY;
