package database

import (
	"context"
	"fmt"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"
)

var Pool *pgxpool.Pool

func Initialize(databaseURL string) error {
	var err error
	Pool, err = pgxpool.New(context.Background(), databaseURL)
	if err != nil {
		return fmt.Errorf("failed to create connection pool: %w", err)
	}

	// Test the connection
	if err = Pool.Ping(context.Background()); err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}

	log.Println("Database connection established")
	return nil
}

func Close() {
	if Pool != nil {
		Pool.Close()
	}
}

func RunMigrations(ctx context.Context) error {
	migrations := []string{
		`-- Enable required extensions
		CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
		CREATE EXTENSION IF NOT EXISTS "pg_trgm";`,

		`-- 1. project – one record per uploaded CSV
		CREATE TABLE IF NOT EXISTS project (
		  id              BIGSERIAL PRIMARY KEY,
		  user_id         UUID          NOT NULL,
		  name            TEXT          NOT NULL,
		  original_name   TEXT          NOT NULL,
		  csv_path        TEXT          NOT NULL,
		  row_count       INTEGER       DEFAULT 0,
		  created_at      TIMESTAMPTZ   DEFAULT NOW(),
		  updated_at      TIMESTAMPTZ   DEFAULT NOW(),
		  deleted_at      TIMESTAMPTZ,
		  CONSTRAINT uniq_user_path UNIQUE (user_id, csv_path)
		);`,

		`-- 2. expense_category – user-defined category list
		CREATE TABLE IF NOT EXISTS expense_category (
		  id          BIGSERIAL PRIMARY KEY,
		  user_id     UUID          NOT NULL,
		  name        TEXT          NOT NULL,
		  is_personal BOOLEAN       DEFAULT FALSE,
		  sort_order  INTEGER       NOT NULL DEFAULT 0,
		  created_at  TIMESTAMPTZ   DEFAULT NOW(),
		  updated_at  TIMESTAMPTZ   DEFAULT NOW(),
		  deleted_at  TIMESTAMPTZ,
		  CONSTRAINT uniq_user_cat UNIQUE (user_id, name, COALESCE(deleted_at,'epoch'))
		);`,

		`-- 3. expense – individual rows from CSV files
		CREATE TABLE IF NOT EXISTS expense (
		  id               BIGSERIAL PRIMARY KEY,
		  project_id       BIGINT        NOT NULL
		                    REFERENCES project(id) ON DELETE CASCADE,
		  row_index        INTEGER       NOT NULL,
		  raw_data         JSONB,
		  description      TEXT,
		  amount           NUMERIC(14,2),
		  suggested_category_id BIGINT
		                    REFERENCES expense_category(id) ON DELETE SET NULL,
		  suggested_at     TIMESTAMPTZ,
		  accepted_category_id  BIGINT
		                    REFERENCES expense_category(id) ON DELETE SET NULL,
		  accepted_at      TIMESTAMPTZ,
		  deleted_at       TIMESTAMPTZ,
		  CONSTRAINT uniq_proj_row UNIQUE (project_id, row_index)
		);`,

		`-- Create indexes
		CREATE INDEX IF NOT EXISTS idx_expense_project ON expense(project_id);
		CREATE INDEX IF NOT EXISTS idx_expense_desc_trgm ON expense USING gin (lower(description) gin_trgm_ops);
		CREATE INDEX IF NOT EXISTS idx_expense_accepted_cat ON expense(accepted_category_id);
		CREATE INDEX IF NOT EXISTS idx_expense_category_sort ON expense_category(user_id, sort_order, deleted_at);`,

		`-- 4. expense_history – audit trail for AI suggestions
		CREATE TABLE IF NOT EXISTS expense_history (
		  id                BIGSERIAL PRIMARY KEY,
		  expense_id        BIGINT      NOT NULL
		                     REFERENCES expense(id) ON DELETE CASCADE,
		  event_type        TEXT        NOT NULL CHECK
		                     (event_type IN ('ai_suggest','retry','manual_accept')),
		  category_id       BIGINT
		                     REFERENCES expense_category(id) ON DELETE SET NULL,
		  model_name        TEXT,
		  prompt_tokens     INTEGER,
		  completion_tokens INTEGER,
		  created_at        TIMESTAMPTZ DEFAULT NOW()
		);`,

		`-- Create index for expense history
		CREATE INDEX IF NOT EXISTS idx_expense_hist_expense ON expense_history(expense_id);`,
	}

	for i, migration := range migrations {
		log.Printf("Running migration %d...", i+1)
		if _, err := Pool.Exec(ctx, migration); err != nil {
			return fmt.Errorf("migration %d failed: %w", i+1, err)
		}
	}

	log.Println("Migrations completed successfully")
	
	// Seed default categories
	if err := SeedDefaultCategories(ctx); err != nil {
		return fmt.Errorf("failed to seed default categories: %w", err)
	}
	
	return nil
}
