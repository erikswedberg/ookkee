package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"ookkee/database"
	"ookkee/models"
)

func GetCategories(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	rows, err := database.Pool.Query(ctx, `
		SELECT id, name, sort_order, created_at 
		FROM expense_category 
		WHERE user_id = $1 AND deleted_at IS NULL 
		ORDER BY sort_order ASC
	`, models.TEST_USER_ID)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to fetch categories: %v", err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var categories []models.Category
	for rows.Next() {
		var category models.Category
		err := rows.Scan(&category.ID, &category.Name, &category.SortOrder, &category.CreatedAt)
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to scan category: %v", err), http.StatusInternalServerError)
			return
		}
		categories = append(categories, category)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(categories)
}

func CreateCategory(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var requestData struct {
		Name string `json:"name"`
	}

	if err := json.NewDecoder(r.Body).Decode(&requestData); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if requestData.Name == "" {
		http.Error(w, "Category name is required", http.StatusBadRequest)
		return
	}

	// Get the highest sort_order to append new category at the end
	var maxSortOrder int
	err := database.Pool.QueryRow(ctx, `
		SELECT COALESCE(MAX(sort_order), 0) 
		FROM expense_category 
		WHERE user_id = $1 AND deleted_at IS NULL
	`, models.TEST_USER_ID).Scan(&maxSortOrder)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to get max sort order: %v", err), http.StatusInternalServerError)
		return
	}

	// Insert new category
	var newCategory models.Category
	err = database.Pool.QueryRow(ctx, `
		INSERT INTO expense_category (user_id, name, sort_order) 
		VALUES ($1, $2, $3) 
		RETURNING id, name, sort_order, created_at
	`, models.TEST_USER_ID, requestData.Name, maxSortOrder+1).Scan(
		&newCategory.ID, &newCategory.Name, &newCategory.SortOrder, &newCategory.CreatedAt)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to create category: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(newCategory)
}

func UpdateCategory(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	categoryID := chi.URLParam(r, "categoryID")
	if categoryID == "" {
		http.Error(w, "Category ID is required", http.StatusBadRequest)
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
		http.Error(w, "Category name is required", http.StatusBadRequest)
		return
	}

	// Update category name
	_, err := database.Pool.Exec(ctx, `
		UPDATE expense_category 
		SET name = $1, updated_at = NOW() 
		WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL
	`, requestData.Name, categoryID, models.TEST_USER_ID)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to update category: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"message": "Category updated successfully"}`))
}

func DeleteCategory(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	categoryID := chi.URLParam(r, "categoryID")
	if categoryID == "" {
		http.Error(w, "Category ID is required", http.StatusBadRequest)
		return
	}

	// Soft delete category
	_, err := database.Pool.Exec(ctx, `
		UPDATE expense_category 
		SET deleted_at = NOW() 
		WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
	`, categoryID, models.TEST_USER_ID)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to delete category: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"message": "Category deleted successfully"}`))
}

func MoveCategory(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	categoryID := chi.URLParam(r, "categoryID")
	if categoryID == "" {
		http.Error(w, "Category ID is required", http.StatusBadRequest)
		return
	}

	var requestData struct {
		Direction string `json:"direction"` // "up" or "down"
	}

	if err := json.NewDecoder(r.Body).Decode(&requestData); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if requestData.Direction != "up" && requestData.Direction != "down" {
		http.Error(w, "Direction must be 'up' or 'down'", http.StatusBadRequest)
		return
	}

	// Get current category's sort_order
	var currentSortOrder int
	err := database.Pool.QueryRow(ctx, `
		SELECT sort_order 
		FROM expense_category 
		WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
	`, categoryID, models.TEST_USER_ID).Scan(&currentSortOrder)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to get category: %v", err), http.StatusInternalServerError)
		return
	}

	// Determine target sort_order
	targetSortOrder := currentSortOrder
	if requestData.Direction == "up" {
		targetSortOrder--
	} else {
		targetSortOrder++
	}

	// Begin transaction to swap sort orders
	tx, err := database.Pool.Begin(ctx)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to begin transaction: %v", err), http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(ctx)

	// Update the other category to take current category's position
	_, err = tx.Exec(ctx, `
		UPDATE expense_category 
		SET sort_order = $1 
		WHERE sort_order = $2 AND user_id = $3 AND deleted_at IS NULL AND id != $4
	`, currentSortOrder, targetSortOrder, models.TEST_USER_ID, categoryID)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to update other category: %v", err), http.StatusInternalServerError)
		return
	}

	// Update current category to target position
	_, err = tx.Exec(ctx, `
		UPDATE expense_category 
		SET sort_order = $1 
		WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL
	`, targetSortOrder, categoryID, models.TEST_USER_ID)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to update category: %v", err), http.StatusInternalServerError)
		return
	}

	if err = tx.Commit(ctx); err != nil {
		http.Error(w, fmt.Sprintf("Failed to commit transaction: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"message": "Category moved successfully"}`))
}
