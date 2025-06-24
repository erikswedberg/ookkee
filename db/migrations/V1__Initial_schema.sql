-- V1__Initial_schema.sql
-- Ookkee Database Schema - Initial Migration

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 1. project – one record per uploaded CSV
CREATE TABLE project (
  id             BIGSERIAL PRIMARY KEY,
  user_id        UUID          NOT NULL,
  name           TEXT          NOT NULL,
  original_name  TEXT          NOT NULL,          -- filename at upload
  csv_path       TEXT          NOT NULL,          -- where the raw CSV lives
  row_count      INTEGER       NOT NULL,
  created_at     TIMESTAMPTZ   DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   DEFAULT NOW(),
  deleted_at     TIMESTAMPTZ,
  CONSTRAINT uniq_user_path UNIQUE (user_id, csv_path)
);

-- 2. expense_category – user-defined category list (CRUD)
CREATE TABLE expense_category (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID          NOT NULL,
  name        TEXT          NOT NULL,
  is_personal BOOLEAN       DEFAULT FALSE,
  created_at  TIMESTAMPTZ   DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ,
  CONSTRAINT uniq_user_cat UNIQUE (user_id, name, COALESCE(deleted_at,'epoch'))
);

-- 3. expense – one row per CSV line
CREATE TABLE expense (
  id                   BIGSERIAL PRIMARY KEY,
  project_id           BIGINT        NOT NULL
                        REFERENCES project(id) ON DELETE CASCADE,
  row_index            INTEGER       NOT NULL,
  raw_data             JSONB         NOT NULL,   -- full CSV row
  description          TEXT,
  amount               NUMERIC(14,2),

  -- current suggestion snapshot
  suggested_category_id BIGINT
                        REFERENCES expense_category(id) ON DELETE SET NULL,
  suggested_at         TIMESTAMPTZ,

  -- accepted snapshot
  accepted_category_id  BIGINT
                        REFERENCES expense_category(id) ON DELETE SET NULL,
  accepted_at          TIMESTAMPTZ,

  deleted_at           TIMESTAMPTZ,
  CONSTRAINT uniq_proj_row UNIQUE (project_id, row_index)
);

-- helpful indexes
CREATE INDEX idx_expense_project         ON expense(project_id);
CREATE INDEX idx_expense_desc_trgm       ON expense USING gin (lower(description) gin_trgm_ops);
CREATE INDEX idx_expense_accepted_cat    ON expense(accepted_category_id);
CREATE INDEX idx_expense_suggested_cat   ON expense(suggested_category_id);

-- 4. expense_history – optional audit trail
CREATE TABLE expense_history (
  id                 BIGSERIAL PRIMARY KEY,
  expense_id         BIGINT      NOT NULL
                      REFERENCES expense(id) ON DELETE CASCADE,
  event_type         TEXT        NOT NULL CHECK
                      (event_type IN ('ai_suggest','retry','manual_accept')),
  category_id        BIGINT
                      REFERENCES expense_category(id) ON DELETE SET NULL,
  model_name         TEXT,
  prompt_tokens      INTEGER,
  completion_tokens  INTEGER,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_expense_hist_expense ON expense_history(expense_id);

-- 5. project_category_totals – summary view (optional)
CREATE MATERIALIZED VIEW project_category_totals AS
SELECT
  e.project_id,
  ec.name        AS category,
  SUM(e.amount)  AS total_amount,
  COUNT(*)       AS txn_count
FROM expense e
JOIN expense_category ec ON e.accepted_category_id = ec.id
WHERE e.deleted_at IS NULL
  AND ec.deleted_at IS NULL
GROUP BY e.project_id, ec.name;
