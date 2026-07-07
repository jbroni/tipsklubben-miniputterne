-- Enable Row Level Security on all public tables.
-- All data access goes through server-side Prisma using the postgres role,
-- which bypasses RLS. No policies are needed.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;
