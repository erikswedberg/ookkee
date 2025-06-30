-- Add hotkey column to expense_category table
ALTER TABLE expense_category ADD COLUMN hotkey CHAR(1) UNIQUE;

-- Update seeded categories with reasonable hotkey defaults
UPDATE expense_category SET hotkey = 'I' WHERE name = 'Auto Insurance';
UPDATE expense_category SET hotkey = 'H' WHERE name = 'Hosting';
UPDATE expense_category SET hotkey = 'F' WHERE name = 'Phone';
UPDATE expense_category SET hotkey = 'G' WHERE name = 'Groceries';
UPDATE expense_category SET hotkey = 'R' WHERE name = 'Rent';
UPDATE expense_category SET hotkey = 'U' WHERE name = 'Utilities';
UPDATE expense_category SET hotkey = 'T' WHERE name = 'Transportation';
UPDATE expense_category SET hotkey = 'E' WHERE name = 'Entertainment';
UPDATE expense_category SET hotkey = 'D' WHERE name = 'Dining Out';
UPDATE expense_category SET hotkey = 'M' WHERE name = 'Medical';
UPDATE expense_category SET hotkey = 'O' WHERE name = 'Office Supplies';
UPDATE expense_category SET hotkey = 'S' WHERE name = 'Software';
UPDATE expense_category SET hotkey = 'L' WHERE name = 'Legal';
UPDATE expense_category SET hotkey = 'C' WHERE name = 'Consulting';
UPDATE expense_category SET hotkey = 'W' WHERE name = 'Marketing';
UPDATE expense_category SET hotkey = 'V' WHERE name = 'Travel';
UPDATE expense_category SET hotkey = 'B' WHERE name = 'Business Meals';
UPDATE expense_category SET hotkey = 'X' WHERE name = 'Miscellaneous';
