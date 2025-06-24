-- V2__Seed_default_categories.sql
-- Add default expense categories for testing

-- Insert default categories for test user
INSERT INTO expense_category (user_id, name, is_personal) VALUES 
  ('00000000-0000-0000-0000-000000000001', 'Office Supplies', false),
  ('00000000-0000-0000-0000-000000000001', 'Software', false),
  ('00000000-0000-0000-0000-000000000001', 'Meals & Entertainment', false),
  ('00000000-0000-0000-0000-000000000001', 'Utilities', false),
  ('00000000-0000-0000-0000-000000000001', 'Income', false),
  ('00000000-0000-0000-0000-000000000001', 'Travel', false),
  ('00000000-0000-0000-0000-000000000001', 'Marketing', false),
  ('00000000-0000-0000-0000-000000000001', 'Professional Services', false),
  ('00000000-0000-0000-0000-000000000001', 'Uncategorized', false);
