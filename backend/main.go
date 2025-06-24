package main

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

const (
	PORT        = ":8080"
	UPLOADS_DIR = "../uploads"
)

func main() {
	r := chi.NewRouter()

	// Middleware
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(60 * time.Second))

	// CORS configuration
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:5173"}, // Vite default port
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
	})

	// Ensure uploads directory exists
	if err := os.MkdirAll(UPLOADS_DIR, 0755); err != nil {
		log.Fatalf("Failed to create uploads directory: %v", err)
	}

	fmt.Printf("Server starting on port %s\n", PORT)
	log.Fatal(http.ListenAndServe(PORT, r))
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status": "ok", "service": "bookkeeping-assistant"}`))
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

	// Return success response
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	response := fmt.Sprintf(`{"message": "File uploaded successfully", "filename": "%s", "originalName": "%s", "size": %d}`,
		filename, handler.Filename, handler.Size)
	w.Write([]byte(response))

	log.Printf("File uploaded: %s (original: %s, size: %d bytes)", filename, handler.Filename, handler.Size)
}
