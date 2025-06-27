-- V4__Update_category_sort_orders.sql
-- Update existing categories with proper sort order and add additional categories

-- First, update existing categories with sort order
UPDATE expense_category SET sort_order = 19 WHERE name = 'Office Supplies' AND user_id = '00000000-0000-0000-0000-000000000001';
UPDATE expense_category SET sort_order = 28 WHERE name = 'Software' AND user_id = '00000000-0000-0000-0000-000000000001';
UPDATE expense_category SET sort_order = 2 WHERE name = 'Meals & Entertainment' AND user_id = '00000000-0000-0000-0000-000000000001';
UPDATE expense_category SET sort_order = 4 WHERE name = 'Utilities' AND user_id = '00000000-0000-0000-0000-000000000001';
UPDATE expense_category SET sort_order = 99 WHERE name = 'Income' AND user_id = '00000000-0000-0000-0000-000000000001';
UPDATE expense_category SET sort_order = 5 WHERE name = 'Travel' AND user_id = '00000000-0000-0000-0000-000000000001';
UPDATE expense_category SET sort_order = 98 WHERE name = 'Marketing' AND user_id = '00000000-0000-0000-0000-000000000001';
UPDATE expense_category SET sort_order = 97 WHERE name = 'Professional Services' AND user_id = '00000000-0000-0000-0000-000000000001';
UPDATE expense_category SET sort_order = 100 WHERE name = 'Uncategorized' AND user_id = '00000000-0000-0000-0000-000000000001';

-- Add additional categories with sort order
INSERT INTO expense_category (user_id, name, is_personal, sort_order) VALUES 
  ('00000000-0000-0000-0000-000000000001', 'Gasoline', false, 1),
  ('00000000-0000-0000-0000-000000000001', 'Parking', false, 3),
  ('00000000-0000-0000-0000-000000000001', 'Computer', false, 6),
  ('00000000-0000-0000-0000-000000000001', 'Tolls', false, 7),
  ('00000000-0000-0000-0000-000000000001', 'Payroll', false, 8),
  ('00000000-0000-0000-0000-000000000001', 'Hosting', false, 9),
  ('00000000-0000-0000-0000-000000000001', 'Auto Insurance', false, 10),
  ('00000000-0000-0000-0000-000000000001', 'Renter''s Insurance', false, 11),
  ('00000000-0000-0000-0000-000000000001', 'Phone', false, 12),
  ('00000000-0000-0000-0000-000000000001', 'Internet', false, 13),
  ('00000000-0000-0000-0000-000000000001', 'Rent', false, 14),
  ('00000000-0000-0000-0000-000000000001', 'Home Improvement', false, 15),
  ('00000000-0000-0000-0000-000000000001', 'Auto Maintenance', false, 16),
  ('00000000-0000-0000-0000-000000000001', 'Medical', false, 17),
  ('00000000-0000-0000-0000-000000000001', 'Tax Prep', false, 18),
  ('00000000-0000-0000-0000-000000000001', 'Education/Training', false, 20),
  ('00000000-0000-0000-0000-000000000001', 'Project Supplies', false, 21),
  ('00000000-0000-0000-0000-000000000001', 'Postage', false, 22),
  ('00000000-0000-0000-0000-000000000001', 'Business Filings', false, 23),
  ('00000000-0000-0000-0000-000000000001', 'Fees', false, 24),
  ('00000000-0000-0000-0000-000000000001', 'Auto Registration', false, 25),
  ('00000000-0000-0000-0000-000000000001', 'Gas Utility Bill', false, 26),
  ('00000000-0000-0000-0000-000000000001', 'Electric', false, 27)
ON CONFLICT (user_id, name, COALESCE(deleted_at,'epoch'::TIMESTAMPTZ)) DO NOTHING;
