package handlers

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"ookkee/database"
	"ookkee/models"
)

func GetProjects(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	rows, err := database.Pool.Query(ctx, `
		SELECT id, name, original_name, row_count, created_at 
		FROM project 
		WHERE user_id = $1 AND deleted_at IS NULL
		ORDER BY created_at DESC
	`, models.TEST_USER_ID)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to fetch projects: %v", err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var projects []models.Project
	for rows.Next() {
		var project models.Project
		err := rows.Scan(&project.ID, &project.Name, &project.OriginalName, &project.RowCount, &project.CreatedAt)
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to scan project: %v", err), http.StatusInternalServerError)
			return
		}
		projects = append(projects, project)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(projects)
}

func GetExpenses(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	projectID := chi.URLParam(r, "projectID")
	if projectID == "" {
		http.Error(w, "Project ID is required", http.StatusBadRequest)
		return
	}

	// Parse pagination parameters
	offset := 0
	limit := 50
	if offsetStr := r.URL.Query().Get("offset"); offsetStr != "" {
		fmt.Sscanf(offsetStr, "%d", &offset)
	}
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		fmt.Sscanf(limitStr, "%d", &limit)
	}

	// Fetch expenses with pagination
	rows, err := database.Pool.Query(ctx, `
		SELECT id, project_id, row_index, raw_data, description, amount, 
		       suggested_category_id, accepted_category_id, is_personal
		FROM expense 
		WHERE project_id = $1 AND deleted_at IS NULL
		ORDER BY row_index ASC
		LIMIT $2 OFFSET $3
	`, projectID, limit, offset)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to fetch expenses: %v", err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var expenses []models.Expense
	for rows.Next() {
		var expense models.Expense
		err := rows.Scan(&expense.ID, &expense.ProjectID, &expense.RowIndex, &expense.RawData,
			&expense.Description, &expense.Amount, &expense.SuggestedCategoryID, &expense.AcceptedCategoryID, &expense.IsPersonal)
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to scan expense: %v", err), http.StatusInternalServerError)
			return
		}
		expenses = append(expenses, expense)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(expenses)
}

func UpdateProject(w http.ResponseWriter, r *http.Request) {
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
	_, err := database.Pool.Exec(ctx, `
		UPDATE project 
		SET name = $1, updated_at = NOW() 
		WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL
	`, requestData.Name, projectID, models.TEST_USER_ID)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to update project: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"message": "Project updated successfully"}`))
}

func DeleteProject(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	projectID := chi.URLParam(r, "projectID")
	if projectID == "" {
		http.Error(w, "Project ID is required", http.StatusBadRequest)
		return
	}

	// Soft delete project
	_, err := database.Pool.Exec(ctx, `
		UPDATE project 
		SET deleted_at = NOW() 
		WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
	`, projectID, models.TEST_USER_ID)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to delete project: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"message": "Project deleted successfully"}`))
}

// UpdateExpense updates an expense's accepted category
func UpdateExpense(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	expenseID := chi.URLParam(r, "expenseID")

	if expenseID == "" {
		http.Error(w, "Expense ID is required", http.StatusBadRequest)
		return
	}

	// Parse request body
	var req struct {
		AcceptedCategoryID  *int  `json:"accepted_category_id"`
		SuggestedCategoryID *int  `json:"suggested_category_id"`
		IsPersonal          *bool `json:"is_personal"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// Build dynamic update query based on provided fields
	updateFields := []string{}
	args := []interface{}{}
	argIndex := 1

	if req.AcceptedCategoryID != nil {
		if *req.AcceptedCategoryID == -1 {
			// -1 means clear the field
			updateFields = append(updateFields, "accepted_category_id = NULL")
			updateFields = append(updateFields, "accepted_at = NULL")
		} else {
			updateFields = append(updateFields, fmt.Sprintf("accepted_category_id = $%d", argIndex))
			args = append(args, req.AcceptedCategoryID)
			argIndex++
			updateFields = append(updateFields, "accepted_at = CURRENT_TIMESTAMP")
		}
	}

	if req.SuggestedCategoryID != nil {
		if *req.SuggestedCategoryID == -1 {
			// -1 means clear the field
			updateFields = append(updateFields, "suggested_category_id = NULL")
			updateFields = append(updateFields, "suggested_at = NULL")
		} else {
			updateFields = append(updateFields, fmt.Sprintf("suggested_category_id = $%d", argIndex))
			args = append(args, req.SuggestedCategoryID)
			argIndex++
			updateFields = append(updateFields, "suggested_at = CURRENT_TIMESTAMP")
		}
	}

	if req.IsPersonal != nil {
		updateFields = append(updateFields, fmt.Sprintf("is_personal = $%d", argIndex))
		args = append(args, *req.IsPersonal)
		argIndex++
	}

	if len(updateFields) == 0 {
		http.Error(w, "No fields to update", http.StatusBadRequest)
		return
	}

	// Add expense ID as final parameter
	args = append(args, expenseID)

	// Execute update
	updateQuery := fmt.Sprintf(`
		UPDATE expense 
		SET %s
		WHERE id = $%d
	`, strings.Join(updateFields, ", "), argIndex)

	_, err := database.Pool.Exec(ctx, updateQuery, args...)

	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to update expense: %v", err), http.StatusInternalServerError)
		return
	}

	// Return success response
	response := map[string]interface{}{
		"message":    "Expense updated successfully",
		"expense_id": expenseID,
	}

	if req.AcceptedCategoryID != nil {
		response["accepted_category_id"] = req.AcceptedCategoryID
	}

	if req.SuggestedCategoryID != nil {
		response["suggested_category_id"] = req.SuggestedCategoryID
	}

	if req.IsPersonal != nil {
		response["is_personal"] = *req.IsPersonal
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// GetProjectTotals gets category totals for a specific project
func GetProjectTotals(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	projectIDStr := chi.URLParam(r, "projectID")

	if projectIDStr == "" {
		http.Error(w, "Project ID is required", http.StatusBadRequest)
		return
	}

	// Query to get category totals
	rows, err := database.Pool.Query(ctx, `
		SELECT 
			ec.name as category_name,
			SUM(e.amount) as total_amount
		FROM expense e
		JOIN expense_category ec ON e.accepted_category_id = ec.id
		WHERE e.project_id = $1 
			AND e.accepted_category_id IS NOT NULL
			AND e.deleted_at IS NULL
		GROUP BY ec.id, ec.name, ec.sort_order
		ORDER BY ec.sort_order ASC
	`, projectIDStr)

	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to fetch totals: %v", err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type CategoryTotal struct {
		CategoryName string  `json:"category_name"`
		TotalAmount  float64 `json:"total_amount"`
	}

	var totals []CategoryTotal
	for rows.Next() {
		var total CategoryTotal
		err := rows.Scan(&total.CategoryName, &total.TotalAmount)
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to scan total: %v", err), http.StatusInternalServerError)
			return
		}
		totals = append(totals, total)
	}

	if err = rows.Err(); err != nil {
		http.Error(w, fmt.Sprintf("Row iteration error: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(totals)
}

// GetProjectProgress gets the categorization progress for a specific project
func GetProjectProgress(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	projectIDStr := chi.URLParam(r, "projectID")

	if projectIDStr == "" {
		http.Error(w, "Project ID is required", http.StatusBadRequest)
		return
	}

	// Query to get total count and categorized count
	var totalCount, categorizedCount int
	err := database.Pool.QueryRow(ctx, `
		SELECT 
			COUNT(*) as total_count,
			COUNT(CASE WHEN (accepted_category_id IS NOT NULL OR is_personal = true) THEN 1 END) as categorized_count
		FROM expense 
		WHERE project_id = $1 AND deleted_at IS NULL
	`, projectIDStr).Scan(&totalCount, &categorizedCount)

	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to fetch progress: %v", err), http.StatusInternalServerError)
		return
	}

	type ProgressData struct {
		TotalCount       int     `json:"total_count"`
		CategorizedCount int     `json:"categorized_count"`
		Percentage       float64 `json:"percentage"`
		IsComplete       bool    `json:"is_complete"`
	}

	percentage := 0.0
	if totalCount > 0 {
		percentage = float64(categorizedCount) / float64(totalCount) * 100
	}

	progress := ProgressData{
		TotalCount:       totalCount,
		CategorizedCount: categorizedCount,
		Percentage:       percentage,
		IsComplete:       categorizedCount == totalCount && totalCount > 0,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(progress)
}

// GetProjectTotalsCSV generates and returns CSV of category totals for a project
func GetProjectTotalsCSV(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	projectIDStr := chi.URLParam(r, "projectID")

	if projectIDStr == "" {
		http.Error(w, "Project ID is required", http.StatusBadRequest)
		return
	}

	// Query to get category totals
	rows, err := database.Pool.Query(ctx, `
		SELECT 
			ec.name as category_name,
			SUM(e.amount) as total_amount
		FROM expense e
		JOIN expense_category ec ON e.accepted_category_id = ec.id
		WHERE e.project_id = $1 
			AND e.accepted_category_id IS NOT NULL
			AND e.deleted_at IS NULL
		GROUP BY ec.id, ec.name, ec.sort_order
		ORDER BY ec.sort_order ASC
	`, projectIDStr)

	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to fetch totals: %v", err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type CategoryTotal struct {
		CategoryName string
		TotalAmount  float64
	}

	var totals []CategoryTotal
	var grandTotal float64

	for rows.Next() {
		var total CategoryTotal
		err := rows.Scan(&total.CategoryName, &total.TotalAmount)
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to scan total: %v", err), http.StatusInternalServerError)
			return
		}
		totals = append(totals, total)
		grandTotal += total.TotalAmount
	}

	if err = rows.Err(); err != nil {
		http.Error(w, fmt.Sprintf("Row iteration error: %v", err), http.StatusInternalServerError)
		return
	}

	// Set CSV headers
	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", "attachment; filename=totals.csv")

	// Create CSV writer
	writer := csv.NewWriter(w)
	defer writer.Flush()

	// Write header
	if err := writer.Write([]string{"Category", "Total"}); err != nil {
		http.Error(w, fmt.Sprintf("Failed to write CSV header: %v", err), http.StatusInternalServerError)
		return
	}

	// Write category totals
	for _, total := range totals {
		if err := writer.Write([]string{
			total.CategoryName,
			strconv.FormatFloat(total.TotalAmount, 'f', 2, 64),
		}); err != nil {
			http.Error(w, fmt.Sprintf("Failed to write CSV row: %v", err), http.StatusInternalServerError)
			return
		}
	}

	// Write grand total row
	if err := writer.Write([]string{
		"Total",
		strconv.FormatFloat(grandTotal, 'f', 2, 64),
	}); err != nil {
		http.Error(w, fmt.Sprintf("Failed to write CSV total row: %v", err), http.StatusInternalServerError)
		return
	}
}
