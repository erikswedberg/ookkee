-- V8__Add_expense_parsed_date.sql
-- Add a real DATE column derived from the messy date_text, so expenses can be
-- sorted chronologically. date_text is preserved untouched as the original.

ALTER TABLE expense ADD COLUMN date DATE;

-- Sort/filter by parsed date
CREATE INDEX idx_expense_date ON expense (date);
