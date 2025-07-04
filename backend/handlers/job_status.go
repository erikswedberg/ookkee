package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
)

// GetJobStatus returns the status of a job
func GetJobStatus(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// Get job ID from URL params
	jobID := chi.URLParam(r, "jobID")
	if jobID == "" {
		http.Error(w, "Job ID is required", http.StatusBadRequest)
		return
	}

	// Check if job manager is available
	if globalJobManager == nil {
		http.Error(w, "Job manager not available", http.StatusServiceUnavailable)
		return
	}

	// Get job from manager
	job, exists := globalJobManager.GetJob(jobID)
	if !exists {
		http.Error(w, "Job not found", http.StatusNotFound)
		return
	}

	// Return job status
	response := map[string]interface{}{
		"job_id":            job.ID,
		"status":            job.Status,
		"selected_expenses": job.SelectedExpenses,
		"categorizations":   job.Categorizations,
		"message":           job.Message,
		"error":             job.Error,
		"created_at":        job.CreatedAt,
		"started_at":        job.StartedAt,
		"completed_at":      job.CompletedAt,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
