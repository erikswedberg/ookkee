package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"ookkee/ai"

	"github.com/go-chi/chi/v5"
)

// AISetPersonalExpenses classifies the next batch of unsorted expenses as
// business or personal, writing staged suggestions (suggested_is_personal).
// Synchronous: the batch is small (20) and this keeps the flow simple.
func AISetPersonalExpenses(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	ctx := r.Context()

	projectID, err := strconv.Atoi(chi.URLParam(r, "projectID"))
	if err != nil {
		http.Error(w, "Invalid project ID", http.StatusBadRequest)
		return
	}

	var req AICategorizeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		req = AICategorizeRequest{}
	}
	if req.Model == "" {
		req.Model = getEnv("AI_MODEL_PROVIDER", "openai")
	}

	expenses, err := ai.GetUnsortedExpenses(ctx, projectID, 20)
	if err != nil {
		log.Printf("Failed to get unsorted expenses: %v", err)
		http.Error(w, "Failed to get expenses", http.StatusInternalServerError)
		return
	}
	if len(expenses) == 0 {
		json.NewEncoder(w).Encode(ai.SetPersonalFullResponse{
			SelectedExpenseIDs: []int{},
			Classifications:    []ai.PersonalResponse{},
			Message:            "No unsorted expenses found",
		})
		return
	}

	categories, err := ai.GetAllCategories(ctx)
	if err != nil {
		log.Printf("Failed to get categories: %v", err)
		http.Error(w, "Failed to get categories", http.StatusInternalServerError)
		return
	}

	result, err := ai.ProcessSetPersonalLogic(ctx, projectID, expenses, categories, req.Model)
	if err != nil {
		log.Printf("AI set-personal failed: %v", err)
		http.Error(w, "AI set-personal failed", http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(result)
}
