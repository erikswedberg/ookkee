-- V7__Add_source_column_and_fix_date.sql
-- Add source column to expense table and change date handling

-- Add source column to expense table
ALTER TABLE expense ADD COLUMN source TEXT;

-- Add date_text column to expense table (keeping existing suggested_at for timestamps)
ALTER TABLE expense ADD COLUMN date_text TEXT;

-- Add index for source column queries
CREATE INDEX idx_expense_source ON expense (source);

-- Add index for date_text column queries  
CREATE INDEX idx_expense_date_text ON expense (date_text);
