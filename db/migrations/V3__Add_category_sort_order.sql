-- Add sort_order field to expense_category table
ALTER TABLE expense_category 
ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

-- Create index for efficient ordering
--CREATE INDEX idx_expense_category_sort ON expense_category(user_id, sort_order, deleted_at);
