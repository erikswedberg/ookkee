package main

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	TEST_USER_ID = "00000000-0000-0000-0000-000000000001"
)

var (
	PORT        = ":" + getEnv("SERVER_PORT", "8080")
	UPLOADS_DIR = getEnv("UPLOADS_DIR", "uploads")
)

var dbPool *pgxpool.Pool

type Project struct {
	ID           int64     `json:"id"`
	UserID       string    `json:"user_id"`
	Name         string    `json:"name"`
	OriginalName string    `json:"original_name"`
	CSVPath      string    `json:"csv_path"`
	RowCount     int       `json:"row_count"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type Expense struct {
	ID                  int64           `json:"id"`
	ProjectID           int64           `json:"project_id"`
	RowIndex            int             `json:"row_index"`
	RawData             json.RawMessage `json:"raw_data"`
	Description         *string         `json:"description"`
	Amount              *float64        `json:"amount"`
	SuggestedCategoryID *int64          `json:"suggested_category_id"`
	AcceptedCategoryID  *int64          `json:"accepted_category_id"`
}

func main() {
	ctx := context.Background()

	// Initialize database connection pool
	var err error
	dbHost := getEnv("DB_HOST", "localhost")
	dbPort := getEnv("DB_PORT", "5432")
	dbName := getEnv("DB_NAME", "ookkee")
	dbUser := getEnv("DB_USER", "postgres")
	dbPassword := getEnv("DB_PASSWORD", "postgres")

	connStr := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		dbHost, dbPort, dbUser, dbPassword, dbName)

	dbPool, err = pgxpool.New(ctx, connStr)
	if err != nil {
		log.Fatalf("Failed to create connection pool: %v", err)
	}
	defer dbPool.Close()

	// Test database connection
	if err := dbPool.Ping(ctx); err != nil {
		log.Fatalf("Failed to ping database: %v", err)
	}

	// Run migrations
	if err := runMigrations(ctx); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}

	r := chi.NewRouter()

	// Middleware
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(60 * time.Second))

	// CORS configuration
	corsOrigins := strings.Split(getEnv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000"), ",")
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   corsOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Routes
	r.Route("/api", func(r chi.Router) {
		r.Post("/upload", handleFileUpload)
		r.Get("/health", handleHealth)
		r.Get("/projects", handleGetProjects)
		r.Get("/projects/{projectID}/expenses", handleGetExpenses)
		r.Put("/projects/{projectID}", handleUpdateProject)
		r.Delete("/projects/{projectID}", handleDeleteProject)
	})

	// Ensure uploads directory exists
	if err := os.MkdirAll(UPLOADS_DIR, 0755); err != nil {
		log.Fatalf("Failed to create uploads directory: %v", err)
	}

	fmt.Printf("Server starting on port %s\n", PORT)
	log.Fatal(http.ListenAndServe(PORT, r))
}

func runMigrations(ctx context.Context) error {
	migrations := []string{
		`-- Enable required extensions
		CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
		CREATE EXTENSION IF NOT EXISTS "pg_trgm";`,

		`-- 1. project – one record per uploaded CSV
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
		);`,

		`-- 2. expense_category – user-defined category list
		CREATE TABLE IF NOT EXISTS expense_category (
		  id          BIGSERIAL PRIMARY KEY,
		  user_id     UUID          NOT NULL,
		  name        TEXT          NOT NULL,
		  is_personal BOOLEAN       DEFAULT FALSE,
		  created_at  TIMESTAMPTZ   DEFAULT NOW(),
		  updated_at  TIMESTAMPTZ   DEFAULT NOW(),
		  deleted_at  TIMESTAMPTZ
		);`,

		`-- 3. expense – one row per CSV line
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
		);`,

		`-- Indexes
		CREATE INDEX IF NOT EXISTS idx_expense_project ON expense(project_id);
		CREATE INDEX IF NOT EXISTS idx_expense_accepted_cat ON expense(accepted_category_id);
		CREATE INDEX IF NOT EXISTS idx_expense_suggested_cat ON expense(suggested_category_id);`,

		`-- Default categories
		INSERT INTO expense_category (user_id, name, is_personal) 
		SELECT '00000000-0000-0000-0000-000000000001', unnest(ARRAY[
		  'Office Supplies', 'Software', 'Meals & Entertainment', 'Utilities', 
		  'Income', 'Travel', 'Marketing', 'Professional Services', 'Uncategorized'
		]), false
		WHERE NOT EXISTS (SELECT 1 FROM expense_category WHERE user_id = '00000000-0000-0000-0000-000000000001');`,
	}

	for i, migration := range migrations {
		log.Printf("Running migration %d...", i+1)
		if _, err := dbPool.Exec(ctx, migration); err != nil {
			return fmt.Errorf("migration %d failed: %w", i+1, err)
		}
	}

	log.Println("All migrations completed successfully")
	return nil
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status": "ok", "service": "ookkee"}`))
}

func handleGetProjects(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	rows, err := dbPool.Query(ctx, "SELECT id, user_id, name, original_name, csv_path, row_count, created_at, updated_at FROM project WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC", TEST_USER_ID)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to fetch projects: %v", err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var projects []Project
	for rows.Next() {
		var p Project
		err := rows.Scan(&p.ID, &p.UserID, &p.Name, &p.OriginalName, &p.CSVPath, &p.RowCount, &p.CreatedAt, &p.UpdatedAt)
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to scan project: %v", err), http.StatusInternalServerError)
			return
		}
		projects = append(projects, p)
	}

	if err := rows.Err(); err != nil {
		http.Error(w, fmt.Sprintf("Row iteration error: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(projects)
}

func handleGetExpenses(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	projectID := chi.URLParam(r, "projectID")
	if projectID == "" {
		http.Error(w, "Project ID is required", http.StatusBadRequest)
		return
	}

	// Parse pagination parameters
	offset := 0
	limit := 50 // Default page size

	if offsetStr := r.URL.Query().Get("offset"); offsetStr != "" {
		if o, err := strconv.Atoi(offsetStr); err == nil {
			offset = o
		}
	}

	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 200 {
			limit = l
		}
	}

	rows, err := dbPool.Query(ctx, `
		SELECT id, project_id, row_index, raw_data, description, amount, 
		       suggested_category_id, accepted_category_id
		FROM expense 
		WHERE project_id = $1 AND deleted_at IS NULL 
		ORDER BY row_index 
		LIMIT $2 OFFSET $3
	`, projectID, limit, offset)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to fetch expenses: %v", err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var expenses []Expense
	for rows.Next() {
		var e Expense
		err := rows.Scan(&e.ID, &e.ProjectID, &e.RowIndex, &e.RawData, &e.Description, &e.Amount, &e.SuggestedCategoryID, &e.AcceptedCategoryID)
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to scan expense: %v", err), http.StatusInternalServerError)
			return
		}
		expenses = append(expenses, e)
	}

	if err := rows.Err(); err != nil {
		http.Error(w, fmt.Sprintf("Row iteration error: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(expenses)
}

func handleFileUpload(w http.ResponseWriter, r *http.Request) {
	// Parse multipart form with 32MB max memory
	err := r.ParseMultipartForm(32 << 20)
	if err != nil {
		http.Error(w, "Failed to parse multipart form", http.StatusBadRequest)
		return
	}

	// Get the file from form data
	file, handler, err := r.FormFile("csvFile")
	if err != nil {
		http.Error(w, "Failed to get file from form", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Get project name from form (optional)
	projectName := r.FormValue("projectName")

	// Validate file extension
	if filepath.Ext(handler.Filename) != ".csv" {
		http.Error(w, "Only CSV files are allowed", http.StatusBadRequest)
		return
	}

	// Create unique filename with timestamp
	timestamp := time.Now().Format("20060102_150405")
	filename := fmt.Sprintf("%s_%s", timestamp, handler.Filename)
	filePath := filepath.Join(UPLOADS_DIR, filename)

	// Create the file on disk
	dst, err := os.Create(filePath)
	if err != nil {
		http.Error(w, "Failed to create file on disk", http.StatusInternalServerError)
		return
	}
	defer dst.Close()

	// Copy file contents
	_, err = io.Copy(dst, file)
	if err != nil {
		http.Error(w, "Failed to save file", http.StatusInternalServerError)
		return
	}

	// Process CSV and create project
	project, err := processCSVFile(r.Context(), filePath, handler.Filename, projectName)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to process CSV: %v", err), http.StatusInternalServerError)
		return
	}

	// Return success response
	w.Header().Set("Content-Type", "application/json")
	response := map[string]interface{}{
		"message":      "File uploaded and processed successfully",
		"filename":     filename,
		"originalName": handler.Filename,
		"size":         handler.Size,
		"project":      project,
	}
	json.NewEncoder(w).Encode(response)

	log.Printf("CSV processed: %s (project ID: %d, %d rows)", filename, project.ID, project.RowCount)
}

func processCSVFile(ctx context.Context, filePath, originalName, projectName string) (*Project, error) {
	// Open and read CSV file
	file, err := os.Open(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open CSV file: %w", err)
	}
	defer file.Close()

	reader := csv.NewReader(file)
	records, err := reader.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("failed to read CSV: %w", err)
	}

	if len(records) == 0 {
		return nil, fmt.Errorf("CSV file is empty")
	}

	headers := records[0]
	dataRows := records[1:]

	// Use provided project name or create from filename
	if projectName == "" {
		projectName = strings.TrimSuffix(originalName, filepath.Ext(originalName))
	}

	// Start transaction
	tx, err := dbPool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Insert project record
	var project Project
	err = tx.QueryRow(ctx, `
		INSERT INTO project (user_id, name, original_name, csv_path, row_count, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
		RETURNING id, user_id, name, original_name, csv_path, row_count, created_at, updated_at
	`, TEST_USER_ID, projectName, originalName, filePath, len(dataRows)).Scan(
		&project.ID, &project.UserID, &project.Name, &project.OriginalName,
		&project.CSVPath, &project.RowCount, &project.CreatedAt, &project.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("failed to create project: %w", err)
	}

	// Process each CSV row and insert into expense table
	for i, row := range dataRows {
		// Create a map of the row data
		rowData := make(map[string]interface{})
		for j, header := range headers {
			if j < len(row) {
				rowData[header] = row[j]
			}
		}

		// Convert to JSON
		rawData, err := json.Marshal(rowData)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal row data: %w", err)
		}

		// Extract description and amount if present
		var description *string
		var amount *float64

		if desc, ok := rowData["Description"]; ok && desc != nil {
			if s, ok := desc.(string); ok && s != "" {
				description = &s
			}
		}

		if amt, ok := rowData["Amount"]; ok && amt != nil {
			if s, ok := amt.(string); ok && s != "" {
				if f, err := strconv.ParseFloat(s, 64); err == nil {
					amount = &f
				}
			}
		}

		// Insert expense record
		_, err = tx.Exec(ctx, `
			INSERT INTO expense (project_id, row_index, raw_data, description, amount)
			VALUES ($1, $2, $3, $4, $5)
		`, project.ID, i, rawData, description, amount)
		if err != nil {
			return nil, fmt.Errorf("failed to insert expense row %d: %w", i, err)
		}
	}

	// Commit transaction
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("failed to commit transaction: %w", err)
	}

	return &project, nil
}

func handleUpdateProject(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	projectID := chi.URLParam(r, "projectID")
	if projectID == "" {
		http.Error(w, "Project ID is required", http.StatusBadRequest)
		return
	}

	var requestData struct {
		Name string `json:"name"`
	}

	if err := json.NewDecoder(r.Body).Decode(&requestData); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if requestData.Name == "" {
		http.Error(w, "Project name is required", http.StatusBadRequest)
		return
	}

	// Update project name
	_, err := dbPool.Exec(ctx, `
		UPDATE project 
		SET name = $1, updated_at = NOW() 
		WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL
	`, requestData.Name, projectID, TEST_USER_ID)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to update project: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"message": "Project updated successfully"}`))
}

func handleDeleteProject(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	projectID := chi.URLParam(r, "projectID")
	if projectID == "" {
		http.Error(w, "Project ID is required", http.StatusBadRequest)
		return
	}

	// Soft delete project
	_, err := dbPool.Exec(ctx, `
		UPDATE project 
		SET deleted_at = NOW() 
		WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
	`, projectID, TEST_USER_ID)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to delete project: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"message": "Project deleted successfully"}`))
}

func getEnv(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultValue
}
