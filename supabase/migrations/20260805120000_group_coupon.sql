-- Create Coverage enum type
CREATE TYPE "Coverage" AS ENUM ('single', 'half', 'full');

-- Create GroupCouponStatus enum type
CREATE TYPE "GroupCouponStatus" AS ENUM ('draft', 'final');

-- Create group_coupons table
CREATE TABLE group_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL UNIQUE,
  system_code text NOT NULL,
  status "GroupCouponStatus" NOT NULL DEFAULT 'draft',
  created_by_id uuid NOT NULL,
  -- timestamp(3) matches Prisma's default native mapping for DateTime on
  -- PostgreSQL; using timestamptz here would show up as drift on migrate diff.
  created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp(3) NOT NULL,
  CONSTRAINT fk_group_coupons_round_id FOREIGN KEY (round_id)
    REFERENCES rounds (id) ON DELETE CASCADE,
  CONSTRAINT fk_group_coupons_created_by_id FOREIGN KEY (created_by_id)
    REFERENCES users (id) ON DELETE CASCADE
);

-- Create group_coupon_matches table
CREATE TABLE group_coupon_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL,
  match_id uuid NOT NULL,
  coverage "Coverage" NOT NULL,
  outcomes "Pick"[] NOT NULL,
  base_outcome "Pick",
  reasoning text NOT NULL,
  is_overridden boolean NOT NULL DEFAULT false,
  CONSTRAINT fk_group_coupon_matches_coupon_id FOREIGN KEY (coupon_id)
    REFERENCES group_coupons (id) ON DELETE CASCADE,
  CONSTRAINT fk_group_coupon_matches_match_id FOREIGN KEY (match_id)
    REFERENCES matches (id) ON DELETE CASCADE,
  CONSTRAINT uq_group_coupon_matches_coupon_id_match_id UNIQUE (coupon_id, match_id)
);

-- Enable Row Level Security
ALTER TABLE group_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_coupon_matches ENABLE ROW LEVEL SECURITY;
