-- Add submission tracking columns to group_coupons
ALTER TABLE group_coupons
ADD COLUMN submitted_at timestamp(3) without time zone,
ADD COLUMN submitted_by_id uuid,
ADD COLUMN submitted_payload text,
ADD COLUMN submission_http_status integer,
ADD COLUMN submission_response text;

-- Add foreign key constraint
ALTER TABLE group_coupons
ADD CONSTRAINT fk_group_coupons_submitted_by_id FOREIGN KEY (submitted_by_id)
  REFERENCES users (id) ON DELETE SET NULL;

-- Create index on submitted_by_id for efficient lookups
CREATE INDEX idx_group_coupons_submitted_by_id ON group_coupons (submitted_by_id);
