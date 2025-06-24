-- 001_initial_schema.sql
-- Ookkee Database Schema - Docker Init

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 1. project – one record per uploaded CSV
CREATE TABLE IF NOT EXISTS project (
  id             BIGSERIAL PRIMARY KEY,
  user_id        UUID          NOT NULL,
  name           TEXT          NOT NULL,
  original_name  TEXT          NOT NULL,
  csv_path       TEXT          NOT NULL,
  row_count      INTEGER       NOT NULL,
  created_at     TIMESTAMPTZ   DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   DEFAULT NOW(),
  deleted_at     TIMESTAMPTZ,
  CONSTRAINT uniq_user_path UNIQUE (user_id, csv_path)
);

-- 2. expense_category – user-defined category list
CREATE TABLE IF NOT EXISTS expense_category (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID          NOT NULL,
  name        TEXT          NOT NULL,
  is_personal BOOLEAN       DEFAULT FALSE,
  created_at  TIMESTAMPTZ   DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

-- 3. expense – one row per CSV line
CREATE TABLE IF NOT EXISTS expense (
  id                   BIGSERIAL PRIMARY KEY,
  project_id           BIGINT        NOT NULL
                        REFERENCES project(id) ON DELETE CASCADE,
  row_index            INTEGER       NOT NULL,
  raw_data             JSONB         NOT NULL,
  description          TEXT,
  amount               NUMERIC(14,2),
  suggested_category_id BIGINT
                        REFERENCES expense_category(id) ON DELETE SET NULL,
  suggested_at         TIMESTAMPTZ,
  accepted_category_id  BIGINT
                        REFERENCES expense_category(id) ON DELETE SET NULL,
  accepted_at          TIMESTAMPTZ,
  deleted_at           TIMESTAMPTZ,
  CONSTRAINT uniq_proj_row UNIQUE (project_id, row_index)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_expense_project ON expense(project_id);
CREATE INDEX IF NOT EXISTS idx_expense_accepted_cat ON expense(accepted_category_id);
CREATE INDEX IF NOT EXISTS idx_expense_suggested_cat ON expense(suggested_category_id);

-- Default categories
INSERT INTO expense_category (user_id, name, is_personal) 
SELECT '00000000-0000-0000-0000-000000000001', unnest(ARRAY[
  'Office Supplies', 'Software', 'Meals & Entertainment', 'Utilities', 
  'Income', 'Travel', 'Marketing', 'Professional Services', 'Uncategorized'
]), false
WHERE NOT EXISTS (SELECT 1 FROM expense_category WHERE user_id = '00000000-0000-0000-0000-000000000001');
