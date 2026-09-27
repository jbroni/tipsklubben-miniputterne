-- Add coupon_delegate_id column to rounds table
ALTER TABLE rounds
ADD COLUMN coupon_delegate_id uuid;

-- Add foreign key constraint
ALTER TABLE rounds
ADD CONSTRAINT fk_rounds_coupon_delegate_id FOREIGN KEY (coupon_delegate_id)
  REFERENCES users (id) ON DELETE SET NULL;

-- Create index on coupon_delegate_id for efficient lookups
CREATE INDEX idx_rounds_coupon_delegate_id ON rounds (coupon_delegate_id);
