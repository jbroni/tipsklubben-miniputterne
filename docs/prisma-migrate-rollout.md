# Prisma Migrate Rollout

## Why this exists

Dev and prod drifted twice because `prisma db push` (dev) did not apply `supabase/migrations/` (prod). Production threw `PrismaClientKnownRequestError P2022: column matches.fedt_home does not exist` because migration `20260716120000_add_fedt_percentages_to_matches.sql` was never applied there.

This switch to Prisma Migrate creates a single source of truth: all schema changes flow through `prisma/schema.prisma` and get versioned migrations that apply uniformly to dev and prod.

## The baseline migration

`prisma/migrations/0_init/migration.sql` is a **baseline**. It was generated from `prisma/schema.prisma` with `migrate diff --from-empty` and describes the schema as it already exists in dev and prod.

**Critical:** On pre-existing dev and prod databases it must be *marked as applied*, never executed. It only ever runs for real against a brand-new empty database.

## Rollout

### Step 1 — Dev

Confirm dev matches the schema:

```bash
npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-schema-datasource prisma/schema.prisma --script
```

This must print "This is an empty migration." (verified 2026-07-24; re-check if time has passed).

Then mark the baseline as applied:

```bash
npx prisma migrate resolve --applied 0_init
```

Verify no pending migrations remain:

```bash
npx prisma migrate status
```

### Step 2 — Production catch-up SQL

Production is missing the fedt columns and possibly RLS. Run this in the Supabase SQL Editor for the **production** project. It is idempotent:

```sql
ALTER TABLE matches
ADD COLUMN IF NOT EXISTS fedt_home integer,
ADD COLUMN IF NOT EXISTS fedt_draw integer,
ADD COLUMN IF NOT EXISTS fedt_away integer;

ALTER TABLE public.users       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seasons     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rounds      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;
```

Note: RLS is intended to have *zero policies* — all access is server-side Prisma via the owner role, which bypasses RLS.

### Step 3 — Baseline prod

With the environment pointed at the production database, mark the baseline as applied:

```bash
npx prisma migrate resolve --applied 0_init
```

**Warning:** Skipping this makes the first production deploy fail with `P3005: database schema is not empty`.

### Step 4 — Vercel

Confirm `DIRECT_URL` is set in the Production environment; `prisma migrate deploy` uses `directUrl`, not `DATABASE_URL`. Then deploy.

## Verification

Run migrations status against each database:

```bash
npx prisma migrate status
```

Check RLS on the database being checked (confirm which database `DATABASE_URL` currently points to):

```bash
npm run db:check-rls
```

## Steady-state workflow

From now on:

1. Edit `prisma/schema.prisma`
2. Create and apply a migration on dev:
   ```bash
   npm run db:migrate
   ```
3. Commit the new directory under `prisma/migrations/`
4. Merge to main
5. Production applies it automatically via the `vercel-build` script, which is guarded on `VERCEL_ENV = production` so preview deployments never migrate prod

Never edit an existing migration; add a new one instead.

`npm run build` remains database-free and is safe to run locally.

## Rollback

If `migrate resolve` is run against the wrong database, the fix is to delete the corresponding row from the `_prisma_migrations` table.
