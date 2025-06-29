-- Add is_personal column to expense table
-- Remove is_personal from expense_category table if it exists

-- Add is_personal column to expense table
ALTER TABLE expense ADD COLUMN is_personal BOOLEAN DEFAULT FALSE;

-- Add index for personal expense queries
CREATE INDEX idx_expense_personal ON expense (is_personal);

-- Remove is_personal from expense_category if it exists
-- (This is safe even if the column doesn't exist)
ALTER TABLE expense_category DROP COLUMN IF EXISTS is_personal;
