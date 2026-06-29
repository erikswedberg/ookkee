-- V10: track the source CSV file(s) that make up a project.
-- A project can be built from one or more uploaded CSVs (appended over time).

CREATE TABLE project_file (
  id            BIGSERIAL PRIMARY KEY,
  project_id    BIGINT       NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  original_name TEXT         NOT NULL,   -- filename at upload
  csv_path      TEXT         NOT NULL,   -- where the raw CSV lives on disk
  row_count     INTEGER      NOT NULL,   -- rows contributed by this file
  created_at    TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX idx_project_file_project ON project_file (project_id);

-- Backfill: each existing project becomes one project_file from its original
-- single-file columns.
INSERT INTO project_file (project_id, original_name, csv_path, row_count, created_at)
SELECT id, original_name, csv_path, row_count, created_at
FROM project
WHERE deleted_at IS NULL;
