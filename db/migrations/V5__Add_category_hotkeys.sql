-- Add hotkey column to expense_category table
ALTER TABLE expense_category ADD COLUMN hotkey CHAR(1) UNIQUE;

-- Update seeded categories with specific hotkey assignments
UPDATE expense_category SET hotkey = 'G' WHERE name = 'Gasoline';
UPDATE expense_category SET hotkey = 'M' WHERE name = 'Meals';
UPDATE expense_category SET hotkey = 'W' WHERE name = 'Water';
UPDATE expense_category SET hotkey = 'T' WHERE name = 'Travel';
UPDATE expense_category SET hotkey = 'C' WHERE name = 'Computer';
UPDATE expense_category SET hotkey = 'L' WHERE name = 'Tolls';
UPDATE expense_category SET hotkey = 'P' WHERE name = 'Payroll';
UPDATE expense_category SET hotkey = 'H' WHERE name = 'Hosting';
-- Auto Insurance gets no hotkey
UPDATE expense_category SET hotkey = 'R' WHERE name = 'Rent';
-- Renters Insurance gets no hotkey
UPDATE expense_category SET hotkey = 'I' WHERE name = 'Internet';
UPDATE expense_category SET hotkey = 'F' WHERE name = 'Phone';
UPDATE expense_category SET hotkey = 'B' WHERE name = 'Business Filings';
UPDATE expense_category SET hotkey = 'O' WHERE name = 'Office Supplies';
UPDATE expense_category SET hotkey = 'E' WHERE name = 'Electric';
UPDATE expense_category SET hotkey = 'S' WHERE name = 'Software';
UPDATE expense_category SET hotkey = 'J' WHERE name = 'Project Supplies';
UPDATE expense_category SET hotkey = 'X' WHERE name = 'Tax Prep';
UPDATE expense_category SET hotkey = 'D' WHERE name = 'Medical';
UPDATE expense_category SET hotkey = 'U' WHERE name = 'Gas Utility';
