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

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

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

	file, header, err := r.FormFile("csvFile")
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

// AppendFileToProject imports an additional CSV into an existing project,
// appending its rows (continuing row_index) and recording it as a project_file.
func AppendFileToProject(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	projectID, err := strconv.ParseInt(chi.URLParam(r, "projectID"), 10, 64)
	if err != nil {
		http.Error(w, "Invalid project ID", http.StatusBadRequest)
		return
	}

	if err := r.ParseMultipartForm(10 << 20); err != nil {
		http.Error(w, "Failed to parse form", http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("csvFile")
	if err != nil {
		http.Error(w, "No file uploaded", http.StatusBadRequest)
		return
	}
	defer file.Close()

	timestamp := time.Now().Format("20060102_150405")
	filename := fmt.Sprintf("%s_%s", timestamp, header.Filename)
	UPLOADS_DIR := getEnv("UPLOADS_DIR", "uploads")
	filepath := fmt.Sprintf("%s/%s", UPLOADS_DIR, filename)

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

	count, err := appendCSVToProject(ctx, projectID, filepath, header.Filename)
	if err != nil {
		// Validation failures (e.g. wrong columns) should not corrupt the
		// existing project; the transaction already rolled back. Remove the
		// saved file and return a clear error.
		os.Remove(filepath)
		http.Error(w, fmt.Sprintf("Failed to append CSV: %v", err), http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message":    "File appended successfully",
		"filename":   filename,
		"rows_added": count,
	})
}

// parsedCSV holds a validated CSV ready for insertion.
type parsedCSV struct {
	headers        []string
	dataRows       [][]string
	sourceColIdx   int
	dateColIdx     int
	descColIdx     int
	amountColIdx   int
	currencyColIdx int
}

// readAndValidateCSV reads a CSV from disk and verifies it has the expected
// columns (Source, Date, Description, Amount, case-insensitive). It refuses
// files whose columns do not match so an append can not silently corrupt a
// project with blank/misaligned data.
func readAndValidateCSV(filepath string) (*parsedCSV, error) {
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
	colIdx := func(name string) int {
		for j, h := range headers {
			if strings.EqualFold(strings.TrimSpace(h), name) {
				return j
			}
		}
		return -1
	}

	p := &parsedCSV{
		headers:        headers,
		dataRows:       records[1:],
		sourceColIdx:   colIdx("Source"),
		dateColIdx:     colIdx("Date"),
		descColIdx:     colIdx("Description"),
		amountColIdx:   colIdx("Amount"),
		currencyColIdx: colIdx("Currency"), // optional; absent -> all USD
	}

	var missing []string
	if p.sourceColIdx < 0 {
		missing = append(missing, "Source")
	}
	if p.dateColIdx < 0 {
		missing = append(missing, "Date")
	}
	if p.descColIdx < 0 {
		missing = append(missing, "Description")
	}
	if p.amountColIdx < 0 {
		missing = append(missing, "Amount")
	}
	if len(missing) > 0 {
		return nil, fmt.Errorf("CSV is missing expected column(s): %s (found: %s)",
			strings.Join(missing, ", "), strings.Join(headers, ", "))
	}

	return p, nil
}

// insertExpenseRows inserts the parsed rows into the given project within tx,
// starting at startRowIndex. Returns the number of rows inserted.
func insertExpenseRows(ctx context.Context, tx pgx.Tx, projectID int64, startRowIndex int, p *parsedCSV) (int, error) {
	dateTexts := make([]string, len(p.dataRows))
	for i, row := range p.dataRows {
		if p.dateColIdx >= 0 && p.dateColIdx < len(row) {
			dateTexts[i] = row[p.dateColIdx]
		}
	}
	parsedDates := resolveDates(dateTexts)

	// Fallback year for FX conversion on rows whose own date didn't parse: use
	// the most common year among the parsed dates, else the current year.
	defaultYear := time.Now().Year()
	{
		counts := map[int]int{}
		for _, d := range parsedDates {
			if d != nil {
				counts[d.Year()]++
			}
		}
		best := 0
		for y, c := range counts {
			if c > best {
				best = c
				defaultYear = y
			}
		}
	}

	for i, row := range p.dataRows {
		rawData := make(map[string]interface{})
		for j, value := range row {
			if j < len(p.headers) {
				rawData[p.headers[j]] = value
			}
		}
		rawDataJSON, err := json.Marshal(rawData)
		if err != nil {
			return 0, fmt.Errorf("failed to marshal raw data for row %d: %w", i, err)
		}

		var source, dateText, description *string
		var amount *float64

		if p.sourceColIdx >= 0 && p.sourceColIdx < len(row) && row[p.sourceColIdx] != "" {
			v := row[p.sourceColIdx]
			source = &v
		}
		if p.dateColIdx >= 0 && p.dateColIdx < len(row) && row[p.dateColIdx] != "" {
			v := row[p.dateColIdx]
			dateText = &v
		}
		if p.descColIdx >= 0 && p.descColIdx < len(row) && row[p.descColIdx] != "" {
			v := row[p.descColIdx]
			description = &v
		}
		if p.amountColIdx >= 0 && p.amountColIdx < len(row) && row[p.amountColIdx] != "" {
			cleanAmount := strings.ReplaceAll(row[p.amountColIdx], "$", "")
			cleanAmount = strings.ReplaceAll(cleanAmount, ",", "")
			cleanAmount = strings.TrimSpace(cleanAmount)
			if amt, err := strconv.ParseFloat(cleanAmount, 64); err == nil {
				// Convert to USD at import using the row's year. amount is always
				// stored as USD; the source CSV remains the record of the original.
				currency := ""
				if p.currencyColIdx >= 0 && p.currencyColIdx < len(row) {
					currency = row[p.currencyColIdx]
				}
				year := defaultYear
				if parsedDates[i] != nil {
					year = parsedDates[i].Year()
				}
				usd := amt * fxRateToUSD(currency, year)
				amount = &usd
			}
		}

		_, err = tx.Exec(ctx, `
			INSERT INTO expense (project_id, row_index, raw_data, source, date_text, date, description, amount)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		`, projectID, startRowIndex+i, rawDataJSON, source, dateText, parsedDates[i], description, amount)
		if err != nil {
			return 0, fmt.Errorf("failed to insert expense row %d: %w", i, err)
		}
	}

	return len(p.dataRows), nil
}

func processCSVAndCreateProject(ctx context.Context, filepath, projectName, originalName string) (*models.Project, error) {
	p, err := readAndValidateCSV(filepath)
	if err != nil {
		return nil, err
	}

	tx, err := database.Pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	var project models.Project
	err = tx.QueryRow(ctx, `
		INSERT INTO project (user_id, name, original_name, csv_path, row_count)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, user_id, name, original_name, csv_path, row_count, created_at, updated_at
	`, models.TEST_USER_ID, projectName, originalName, filepath, len(p.dataRows)).Scan(
		&project.ID, &project.UserID, &project.Name, &project.OriginalName,
		&project.CSVPath, &project.RowCount, &project.CreatedAt, &project.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("failed to create project: %w", err)
	}

	count, err := insertExpenseRows(ctx, tx, project.ID, 0, p)
	if err != nil {
		return nil, err
	}

	// Record the source file.
	_, err = tx.Exec(ctx, `
		INSERT INTO project_file (project_id, original_name, csv_path, row_count)
		VALUES ($1, $2, $3, $4)
	`, project.ID, originalName, filepath, count)
	if err != nil {
		return nil, fmt.Errorf("failed to record project file: %w", err)
	}

	if err = tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("failed to commit transaction: %w", err)
	}

	return &project, nil
}

// appendCSVToProject imports an additional CSV into an existing project,
// continuing row_index after the current maximum. Returns the rows added.
func appendCSVToProject(ctx context.Context, projectID int64, filepath, originalName string) (int, error) {
	p, err := readAndValidateCSV(filepath)
	if err != nil {
		return 0, err
	}

	tx, err := database.Pool.Begin(ctx)
	if err != nil {
		return 0, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Continue row_index after the current max for this project.
	var maxRowIndex int
	err = tx.QueryRow(ctx,
		`SELECT COALESCE(MAX(row_index), -1) FROM expense WHERE project_id = $1`,
		projectID).Scan(&maxRowIndex)
	if err != nil {
		return 0, fmt.Errorf("failed to get max row index: %w", err)
	}

	count, err := insertExpenseRows(ctx, tx, projectID, maxRowIndex+1, p)
	if err != nil {
		return 0, err
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO project_file (project_id, original_name, csv_path, row_count)
		VALUES ($1, $2, $3, $4)
	`, projectID, originalName, filepath, count)
	if err != nil {
		return 0, fmt.Errorf("failed to record project file: %w", err)
	}

	// Keep project.row_count in sync.
	_, err = tx.Exec(ctx,
		`UPDATE project SET row_count = row_count + $1, updated_at = NOW() WHERE id = $2`,
		count, projectID)
	if err != nil {
		return 0, fmt.Errorf("failed to update project row count: %w", err)
	}

	if err = tx.Commit(ctx); err != nil {
		return 0, fmt.Errorf("failed to commit transaction: %w", err)
	}

	return count, nil
}
