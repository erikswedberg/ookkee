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

// GetProjectFiles returns the source CSV files that make up a project.
func GetProjectFiles(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	projectID := chi.URLParam(r, "projectID")
	if projectID == "" {
		http.Error(w, "Project ID is required", http.StatusBadRequest)
		return
	}

	rows, err := database.Pool.Query(ctx, `
		SELECT id, project_id, original_name, row_count, created_at
		FROM project_file
		WHERE project_id = $1
		ORDER BY created_at ASC, id ASC
	`, projectID)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to fetch project files: %v", err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	files := []models.ProjectFile{}
	for rows.Next() {
		var f models.ProjectFile
		if err := rows.Scan(&f.ID, &f.ProjectID, &f.OriginalName, &f.RowCount, &f.CreatedAt); err != nil {
			http.Error(w, fmt.Sprintf("Failed to scan project file: %v", err), http.StatusInternalServerError)
			return
		}
		files = append(files, f)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(files)
}

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

	// Build view/search filter
	filter := parseExpenseFilter(r)
	filterSQL, filterArgs := filter.clause(2) // $1 is projectID; filter args start at $2

	args := []interface{}{projectID}
	args = append(args, filterArgs...)
	// limit/offset placeholders come after project + filter args
	limitIdx := len(args) + 1
	offsetIdx := len(args) + 2
	args = append(args, limit, offset)

	query := fmt.Sprintf(`
		SELECT id, project_id, row_index, raw_data, source, date_text, date, description, amount, 
		       suggested_category_id, accepted_category_id, is_personal, suggested_is_personal
		FROM expense 
		WHERE project_id = $1%s
		ORDER BY %s
		LIMIT $%d OFFSET $%d
	`, filterSQL, orderByClause(r.URL.Query().Get("sort")), limitIdx, offsetIdx)

	// Fetch expenses with pagination
	rows, err := database.Pool.Query(ctx, query, args...)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to fetch expenses: %v", err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var expenses []models.Expense
	for rows.Next() {
		var expense models.Expense
		err := rows.Scan(&expense.ID, &expense.ProjectID, &expense.RowIndex, &expense.RawData,
			&expense.Source, &expense.DateText, &expense.Date, &expense.Description, &expense.Amount, &expense.SuggestedCategoryID, &expense.AcceptedCategoryID, &expense.IsPersonal, &expense.SuggestedIsPersonal)
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to scan expense: %v", err), http.StatusInternalServerError)
			return
		}
		expenses = append(expenses, expense)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(expenses)
}

// GetExpenseCount returns the number of expenses matching the current
// view/search filter. The virtual scroll uses this to size its scrollbar.
func GetExpenseCount(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	projectID := chi.URLParam(r, "projectID")
	if projectID == "" {
		http.Error(w, "Project ID is required", http.StatusBadRequest)
		return
	}

	filter := parseExpenseFilter(r)
	filterSQL, filterArgs := filter.clause(2)
	args := []interface{}{projectID}
	args = append(args, filterArgs...)

	query := fmt.Sprintf(`
		SELECT COUNT(*) FROM expense
		WHERE project_id = $1%s
	`, filterSQL)

	var count int
	if err := database.Pool.QueryRow(ctx, query, args...).Scan(&count); err != nil {
		http.Error(w, fmt.Sprintf("Failed to count expenses: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]int{"count": count})
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
		AcceptedCategoryID      *int  `json:"accepted_category_id"`
		SuggestedCategoryID     *int  `json:"suggested_category_id"`
		IsPersonal              *bool `json:"is_personal"`
		Deleted                 *bool `json:"deleted"`
		ClearPersonalSuggestion *bool `json:"clear_personal_suggestion"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// Get the current expense details for auto-propagation
	var currentExpense struct {
		ProjectID   int    `db:"project_id"`
		Description string `db:"description"`
	}

	getExpenseQuery := `SELECT project_id, description FROM expense WHERE id = $1`
	err := database.Pool.QueryRow(ctx, getExpenseQuery, expenseID).Scan(
		&currentExpense.ProjectID, &currentExpense.Description)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to get expense details: %v", err), http.StatusInternalServerError)
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
		// A confirmed decision clears any pending AI suggestion.
		updateFields = append(updateFields, "suggested_is_personal = NULL")
	}

	if req.Deleted != nil {
		if *req.Deleted {
			updateFields = append(updateFields, "deleted_at = CURRENT_TIMESTAMP")
		} else {
			updateFields = append(updateFields, "deleted_at = NULL")
		}
	}

	// Dismiss an AI business/personal suggestion without changing is_personal.
	if req.ClearPersonalSuggestion != nil && *req.ClearPersonalSuggestion {
		updateFields = append(updateFields, "suggested_is_personal = NULL")
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

	_, err = database.Pool.Exec(ctx, updateQuery, args...)

	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to update expense: %v", err), http.StatusInternalServerError)
		return
	}

	// NOTE: auto-propagation has been removed. A single edit now only affects the
	// one expense. Propagation to identical descriptions is opt-in via the
	// /similar + /bulk-update endpoints, gated by a confirmation modal in the UI.

	// Return success response with actual database values (not request values)
	response := map[string]interface{}{
		"message":    "Expense updated successfully",
		"expense_id": expenseID,
	}

	if req.AcceptedCategoryID != nil {
		if *req.AcceptedCategoryID == -1 {
			response["accepted_category_id"] = nil
		} else {
			response["accepted_category_id"] = req.AcceptedCategoryID
		}
	}

	if req.SuggestedCategoryID != nil {
		if *req.SuggestedCategoryID == -1 {
			response["suggested_category_id"] = nil
		} else {
			response["suggested_category_id"] = req.SuggestedCategoryID
		}
	}

	if req.IsPersonal != nil {
		response["is_personal"] = *req.IsPersonal
	}

	if req.Deleted != nil {
		response["deleted"] = *req.Deleted
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

	type CategoryTotal struct {
		CategoryName string  `json:"category_name"`
		TotalAmount  float64 `json:"total_amount"`
	}

	// Business: categorized, non-personal expenses grouped by category.
	businessQuery := `
		SELECT ec.name AS category_name, SUM(e.amount) AS total_amount
		FROM expense e
		JOIN expense_category ec ON e.accepted_category_id = ec.id
		WHERE e.project_id = $1
			AND e.accepted_category_id IS NOT NULL
			AND e.deleted_at IS NULL
			AND (e.is_personal IS NULL OR e.is_personal = FALSE)
		GROUP BY ec.id, ec.name, ec.sort_order
		ORDER BY ec.sort_order ASC
	`

	// Personal: personal expenses grouped by their category, with an
	// "Uncategorized" bucket for personal rows that have no category yet.
	personalQuery := `
		SELECT COALESCE(ec.name, 'Uncategorized') AS category_name,
		       SUM(e.amount) AS total_amount,
		       COALESCE(ec.sort_order, 2147483647) AS sort_order
		FROM expense e
		LEFT JOIN expense_category ec ON e.accepted_category_id = ec.id
		WHERE e.project_id = $1
			AND e.deleted_at IS NULL
			AND e.is_personal = TRUE
		GROUP BY ec.id, ec.name, ec.sort_order
		ORDER BY sort_order ASC, category_name ASC
	`

	readTotals := func(query string, hasSort bool) ([]CategoryTotal, error) {
		rows, err := database.Pool.Query(ctx, query, projectIDStr)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		out := []CategoryTotal{}
		for rows.Next() {
			var t CategoryTotal
			if hasSort {
				var sortOrder int
				if err := rows.Scan(&t.CategoryName, &t.TotalAmount, &sortOrder); err != nil {
					return nil, err
				}
			} else {
				if err := rows.Scan(&t.CategoryName, &t.TotalAmount); err != nil {
					return nil, err
				}
			}
			out = append(out, t)
		}
		return out, rows.Err()
	}

	business, err := readTotals(businessQuery, false)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to fetch business totals: %v", err), http.StatusInternalServerError)
		return
	}
	personal, err := readTotals(personalQuery, true)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to fetch personal totals: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"business": business,
		"personal": personal,
	})
}

// GetProjectProgress gets the categorization progress for a specific project
func GetProjectProgress(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	projectIDStr := chi.URLParam(r, "projectID")

	if projectIDStr == "" {
		http.Error(w, "Project ID is required", http.StatusBadRequest)
		return
	}

	// Query to get total count, categorized count (for progress), uncategorized
	// count (for AI button), and pending personal suggestions (for approve-all).
	var totalCount, categorizedCount, uncategorizedCount, pendingPersonalCount, pendingSuggestedCount int
	err := database.Pool.QueryRow(ctx, `
		SELECT 
			COUNT(*) as total_count,
			COUNT(CASE WHEN (accepted_category_id IS NOT NULL OR is_personal = true) THEN 1 END) as categorized_count,
			COUNT(CASE WHEN (is_personal IS NULL OR is_personal = false) AND accepted_category_id IS NULL AND suggested_category_id IS NULL THEN 1 END) as uncategorized_count,
			COUNT(CASE WHEN suggested_is_personal = TRUE THEN 1 END) as pending_personal_count,
			COUNT(CASE WHEN suggested_category_id IS NOT NULL AND accepted_category_id IS NULL THEN 1 END) as pending_suggested_count
		FROM expense 
		WHERE project_id = $1 AND deleted_at IS NULL
	`, projectIDStr).Scan(&totalCount, &categorizedCount, &uncategorizedCount, &pendingPersonalCount, &pendingSuggestedCount)

	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to fetch progress: %v", err), http.StatusInternalServerError)
		return
	}

	type ProgressData struct {
		TotalCount            int     `json:"total_count"`
		CategorizedCount      int     `json:"categorized_count"`
		UncategorizedCount    int     `json:"uncategorized_count"`
		PendingPersonalCount  int     `json:"pending_personal_count"`
		PendingSuggestedCount int     `json:"pending_suggested_count"`
		Percentage            float64 `json:"percentage"`
		IsComplete            bool    `json:"is_complete"`
	}

	percentage := 0.0
	if totalCount > 0 {
		percentage = float64(categorizedCount) / float64(totalCount) * 100
	}

	progress := ProgressData{
		TotalCount:            totalCount,
		CategorizedCount:      categorizedCount,
		UncategorizedCount:    uncategorizedCount,
		PendingPersonalCount:  pendingPersonalCount,
		PendingSuggestedCount: pendingSuggestedCount,
		Percentage:            percentage,
		IsComplete:            categorizedCount == totalCount && totalCount > 0,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(progress)
}

// GetProjectTotalsCSV returns a single CSV with Business and Personal sections,
// each grouped by category with a subtotal, plus a grand total.
func GetProjectTotalsCSV(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	projectIDStr := chi.URLParam(r, "projectID")
	if projectIDStr == "" {
		http.Error(w, "Project ID is required", http.StatusBadRequest)
		return
	}

	type categoryTotal struct {
		Name   string
		Amount float64
	}

	readSection := func(query string) ([]categoryTotal, float64, error) {
		rows, err := database.Pool.Query(ctx, query, projectIDStr)
		if err != nil {
			return nil, 0, err
		}
		defer rows.Close()
		var out []categoryTotal
		var sum float64
		for rows.Next() {
			var t categoryTotal
			if err := rows.Scan(&t.Name, &t.Amount); err != nil {
				return nil, 0, err
			}
			out = append(out, t)
			sum += t.Amount
		}
		return out, sum, rows.Err()
	}

	business, businessTotal, err := readSection(`
		SELECT ec.name AS category_name, SUM(e.amount) AS total_amount
		FROM expense e
		JOIN expense_category ec ON e.accepted_category_id = ec.id
		WHERE e.project_id = $1 AND e.accepted_category_id IS NOT NULL AND e.deleted_at IS NULL
			AND (e.is_personal IS NULL OR e.is_personal = FALSE)
		GROUP BY ec.id, ec.name, ec.sort_order
		ORDER BY ec.sort_order ASC`)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to fetch business totals: %v", err), http.StatusInternalServerError)
		return
	}
	personal, personalTotal, err := readSection(`
		SELECT COALESCE(ec.name, 'Uncategorized') AS category_name, SUM(e.amount) AS total_amount
		FROM expense e
		LEFT JOIN expense_category ec ON e.accepted_category_id = ec.id
		WHERE e.project_id = $1 AND e.deleted_at IS NULL AND e.is_personal = TRUE
		GROUP BY ec.id, ec.name, ec.sort_order
		ORDER BY COALESCE(ec.sort_order, 2147483647) ASC, category_name ASC`)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to fetch personal totals: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", "attachment; filename=totals.csv")
	writer := csv.NewWriter(w)
	defer writer.Flush()

	money := func(v float64) string { return strconv.FormatFloat(v, 'f', 2, 64) }

	writeSection := func(title string, rows []categoryTotal, subtotal float64) error {
		if err := writer.Write([]string{title, ""}); err != nil {
			return err
		}
		for _, t := range rows {
			if err := writer.Write([]string{t.Name, money(t.Amount)}); err != nil {
				return err
			}
		}
		return writer.Write([]string{title + " Total", money(subtotal)})
	}

	writer.Write([]string{"Category", "Total"})
	if err := writeSection("Business", business, businessTotal); err != nil {
		http.Error(w, fmt.Sprintf("Failed to write CSV: %v", err), http.StatusInternalServerError)
		return
	}
	writer.Write([]string{"", ""})
	if err := writeSection("Personal", personal, personalTotal); err != nil {
		http.Error(w, fmt.Sprintf("Failed to write CSV: %v", err), http.StatusInternalServerError)
		return
	}
	writer.Write([]string{"", ""})
	writer.Write([]string{"Grand Total", money(businessTotal + personalTotal)})
}

// GetSimilarExpenses returns OTHER expenses in the same project sharing the
// given expense's description, that are candidates for a propagated change.
// Used to populate the confirmation modal before bulk-applying a category or
// personal flag. Query params:
//
//	expenseId  (required) the just-edited expense
//	field      "category" | "personal" (default "category")
//
// For "category": candidates are same-description rows without an accepted
// category (so we don't clobber prior manual work).
// For "personal": candidates are same-description rows not already personal.
func GetSimilarExpenses(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	projectID := chi.URLParam(r, "projectID")

	expenseIDStr := r.URL.Query().Get("expenseId")
	if expenseIDStr == "" {
		http.Error(w, "expenseId is required", http.StatusBadRequest)
		return
	}
	field := r.URL.Query().Get("field")
	if field == "" {
		field = "category"
	}

	// Fetch the source expense's description.
	var description *string
	err := database.Pool.QueryRow(ctx,
		`SELECT description FROM expense WHERE id = $1`, expenseIDStr).Scan(&description)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to get expense: %v", err), http.StatusInternalServerError)
		return
	}
	if description == nil || *description == "" {
		// No description to match on; nothing similar.
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]models.Expense{})
		return
	}

	var condition string
	switch field {
	case "personal":
		condition = "AND (is_personal IS NULL OR is_personal = FALSE)"
	default: // category
		condition = "AND accepted_category_id IS NULL"
	}

	query := fmt.Sprintf(`
		SELECT id, project_id, row_index, raw_data, source, date_text, date, description, amount,
		       suggested_category_id, accepted_category_id, is_personal
		FROM expense
		WHERE project_id = $1
		  AND deleted_at IS NULL
		  AND id <> $2
		  AND lower(description) = lower($3)
		  %s
		ORDER BY date ASC NULLS LAST, row_index ASC
	`, condition)

	rows, err := database.Pool.Query(ctx, query, projectID, expenseIDStr, *description)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to fetch similar expenses: %v", err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	expenses := []models.Expense{}
	for rows.Next() {
		var e models.Expense
		if err := rows.Scan(&e.ID, &e.ProjectID, &e.RowIndex, &e.RawData,
			&e.Source, &e.DateText, &e.Date, &e.Description, &e.Amount,
			&e.SuggestedCategoryID, &e.AcceptedCategoryID, &e.IsPersonal); err != nil {
			http.Error(w, fmt.Sprintf("Failed to scan: %v", err), http.StatusInternalServerError)
			return
		}
		expenses = append(expenses, e)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(expenses)
}

// BulkUpdateExpenses applies a category or personal flag to an explicit list of
// expense IDs. Used when the user confirms propagation in the modal.
// ResolvePersonalSuggestions bulk-applies or dismisses ALL pending AI
// business/personal suggestions for a project. action="approve" confirms each
// suggestion (sets is_personal to the suggested value); action="dismiss" just
// clears them. Returns how many were affected.
// ResolveCategorySuggestions bulk-applies or dismisses ALL pending AI category
// suggestions for a project (rows with a suggested category but no accepted one).
// approve -> accepted = suggested; dismiss -> clear the suggestion.
func ResolveCategorySuggestions(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	projectID := chi.URLParam(r, "projectID")

	var req struct {
		Action string `json:"action"` // "approve" | "dismiss"
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	var query string
	switch req.Action {
	case "approve":
		query = `UPDATE expense
			SET accepted_category_id = suggested_category_id, accepted_at = CURRENT_TIMESTAMP
			WHERE project_id = $1 AND deleted_at IS NULL
			  AND suggested_category_id IS NOT NULL AND accepted_category_id IS NULL`
	case "dismiss":
		query = `UPDATE expense
			SET suggested_category_id = NULL, suggested_at = NULL
			WHERE project_id = $1 AND deleted_at IS NULL
			  AND suggested_category_id IS NOT NULL AND accepted_category_id IS NULL`
	default:
		http.Error(w, "action must be 'approve' or 'dismiss'", http.StatusBadRequest)
		return
	}

	tag, err := database.Pool.Exec(ctx, query, projectID)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to resolve suggestions: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"affected": tag.RowsAffected()})
}

func ResolvePersonalSuggestions(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	projectID := chi.URLParam(r, "projectID")

	var req struct {
		Action string `json:"action"` // "approve" | "dismiss"
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// Only personal (true) suggestions need user action; business (false)
	// suggestions are just "AI reviewed, decided business" bookkeeping.
	var query string
	switch req.Action {
	case "approve":
		// Confirm personal, clear the suggestion.
		query = `UPDATE expense
			SET is_personal = TRUE, suggested_is_personal = NULL
			WHERE project_id = $1 AND deleted_at IS NULL AND suggested_is_personal = TRUE`
	case "dismiss":
		query = `UPDATE expense
			SET suggested_is_personal = NULL
			WHERE project_id = $1 AND deleted_at IS NULL AND suggested_is_personal = TRUE`
	default:
		http.Error(w, "action must be 'approve' or 'dismiss'", http.StatusBadRequest)
		return
	}

	tag, err := database.Pool.Exec(ctx, query, projectID)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to resolve suggestions: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"affected": tag.RowsAffected()})
}

func BulkUpdateExpenses(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req struct {
		IDs                []int `json:"ids"`
		AcceptedCategoryID *int  `json:"accepted_category_id"`
		IsPersonal         *bool `json:"is_personal"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	if len(req.IDs) == 0 {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"updated": 0})
		return
	}

	setParts := []string{}
	args := []interface{}{}
	argIndex := 1

	if req.AcceptedCategoryID != nil {
		if *req.AcceptedCategoryID == -1 {
			setParts = append(setParts, "accepted_category_id = NULL", "accepted_at = NULL")
		} else {
			setParts = append(setParts, fmt.Sprintf("accepted_category_id = $%d", argIndex))
			args = append(args, *req.AcceptedCategoryID)
			argIndex++
			setParts = append(setParts, "accepted_at = CURRENT_TIMESTAMP")
		}
	}
	if req.IsPersonal != nil {
		setParts = append(setParts, fmt.Sprintf("is_personal = $%d", argIndex))
		args = append(args, *req.IsPersonal)
		argIndex++
		setParts = append(setParts, "suggested_is_personal = NULL")
	}
	if len(setParts) == 0 {
		http.Error(w, "No fields to update", http.StatusBadRequest)
		return
	}

	args = append(args, req.IDs)
	query := fmt.Sprintf(`UPDATE expense SET %s WHERE id = ANY($%d)`,
		strings.Join(setParts, ", "), argIndex)

	tag, err := database.Pool.Exec(ctx, query, args...)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to bulk update: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"updated": tag.RowsAffected()})
}
