package handlers

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"ookkee/database"
	"ookkee/models"
)

func getEnv(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultValue
}

func FileUpload(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Parse multipart form
	if err := r.ParseMultipartForm(10 << 20); err != nil { // 10MB max
		http.Error(w, "Failed to parse form", http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "No file uploaded", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Get project name from form data (optional)
	projectName := r.FormValue("projectName")
	if projectName == "" {
		// Use filename without extension as default project name
		projectName = strings.TrimSuffix(header.Filename, ".csv")
	}

	// Create timestamped filename
	timestamp := time.Now().Format("20060102_150405")
	filename := fmt.Sprintf("%s_%s", timestamp, header.Filename)
	
	UPLOADS_DIR := getEnv("UPLOADS_DIR", "uploads")
	filepath := fmt.Sprintf("%s/%s", UPLOADS_DIR, filename)

	// Save file to disk
	dst, err := os.Create(filepath)
	if err != nil {
		http.Error(w, "Failed to save file", http.StatusInternalServerError)
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		http.Error(w, "Failed to copy file", http.StatusInternalServerError)
		return
	}

	// Process CSV and create project
	project, err := processCSVAndCreateProject(ctx, filepath, projectName, header.Filename)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to process CSV: %v", err), http.StatusInternalServerError)
		return
	}

	// Return success response
	response := map[string]interface{}{
		"message":  "File uploaded and processed successfully",
		"filename": filename,
		"project":  project,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

func processCSVAndCreateProject(ctx context.Context, filepath, projectName, originalName string) (*models.Project, error) {
	// Open and read CSV file
	file, err := os.Open(filepath)
	if err != nil {
		return nil, fmt.Errorf("failed to open file: %w", err)
	}
	defer file.Close()

	reader := csv.NewReader(file)
	records, err := reader.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("failed to read CSV: %w", err)
	}

	if len(records) < 2 {
		return nil, fmt.Errorf("CSV must have at least a header and one data row")
	}

	headers := records[0]
	dataRows := records[1:]

	// Begin transaction
	tx, err := database.Pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Create project
	var project models.Project
	err = tx.QueryRow(ctx, `
		INSERT INTO project (user_id, name, original_name, csv_path, row_count) 
		VALUES ($1, $2, $3, $4, $5) 
		RETURNING id, user_id, name, original_name, csv_path, row_count, created_at, updated_at
	`, models.TEST_USER_ID, projectName, originalName, filepath, len(dataRows)).Scan(
		&project.ID, &project.UserID, &project.Name, &project.OriginalName, 
		&project.CSVPath, &project.RowCount, &project.CreatedAt, &project.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("failed to create project: %w", err)
	}

	// Insert expense records
	for i, row := range dataRows {
		rawData := make(map[string]interface{})
		for j, value := range row {
			if j < len(headers) {
				rawData[headers[j]] = value
			}
		}

		rawDataJSON, err := json.Marshal(rawData)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal raw data for row %d: %w", i, err)
		}

		// Extract common fields
		var description *string
		var amount *float64

		if desc, ok := rawData["Description"].(string); ok && desc != "" {
			description = &desc
		}
		if amtStr, ok := rawData["Amount"].(string); ok && amtStr != "" {
			if amt, err := strconv.ParseFloat(amtStr, 64); err == nil {
				amount = &amt
			}
		}

		_, err = tx.Exec(ctx, `
			INSERT INTO expense (project_id, row_index, raw_data, description, amount) 
			VALUES ($1, $2, $3, $4, $5)
		`, project.ID, i, rawDataJSON, description, amount)
		if err != nil {
			return nil, fmt.Errorf("failed to insert expense row %d: %w", i, err)
		}
	}

	if err = tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("failed to commit transaction: %w", err)
	}

	return &project, nil
}
