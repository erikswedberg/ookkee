-- Enable fuzzy text matching for description similarity
-- This migration adds pg_trgm extension and indexes for efficient fuzzy matching

-- Enable pg_trgm extension for trigram matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create trigram index on expense descriptions for fast similarity searches
CREATE INDEX IF NOT EXISTS idx_expense_desc_trgm 
    ON expense USING gin (lower(description) gin_trgm_ops);

-- Create index on project_id + accepted_category_id for accepted_map queries
CREATE INDEX IF NOT EXISTS idx_expense_accepted_lookup 
    ON expense (project_id, accepted_category_id) 
    WHERE accepted_category_id IS NOT NULL;

-- Create index for exact description matching (auto-propagation)
CREATE INDEX IF NOT EXISTS idx_expense_desc_exact 
    ON expense (project_id, lower(description)) 
    WHERE accepted_category_id IS NULL;
