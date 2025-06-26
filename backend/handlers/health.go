package handlers

import (
	"encoding/json"
	"net/http"

	"ookkee/database"
)

func Health(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Test database connection
	if err := database.Pool.Ping(ctx); err != nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]string{
			"status": "unhealthy",
			"error":  err.Error(),
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status": "healthy",
	})
}
