-- Set 'guest' as the default role for new users
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'guest';
