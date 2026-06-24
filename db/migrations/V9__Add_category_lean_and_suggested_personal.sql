-- V9: business/personal "lean" on categories + suggested_is_personal staging on expenses.

-- Category lean: 'business' | 'personal' | NULL (unset / either).
-- Used as a prior for AI business/personal classification and to order the
-- category dropdown by relevance to the current tab.
ALTER TABLE expense_category ADD COLUMN lean TEXT;

-- AI's business/personal suggestion, staged like suggested_category_id so it can
-- be reviewed/accepted rather than silently flipping is_personal.
ALTER TABLE expense ADD COLUMN suggested_is_personal BOOLEAN;
ALTER TABLE expense ADD COLUMN suggested_personal_at TIMESTAMPTZ;

-- Seed default leans (per user guidance; gas/meals/parking left unset = either).
UPDATE expense_category SET lean = 'business' WHERE name IN (
  'Computer', 'Tolls', 'Payroll', 'Hosting', 'Tax Prep', 'Office Supplies',
  'Education/Training', 'Project Supplies', 'Postage', 'Business Filings',
  'Fees', 'Software', 'Travel'
);
UPDATE expense_category SET lean = 'personal' WHERE name IN (
  'Water', 'Auto Insurance', 'Renter''s Insurance', 'Phone', 'Internet',
  'Rent', 'Home Improvement', 'Auto Maintenance', 'Medical',
  'Auto Registration', 'Gas Utility Bill', 'Electric'
);
