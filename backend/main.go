package main

import (
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"ookkee/database"
	"ookkee/handlers"
)

func main() {

	// Get configuration from environment
	DBHost := getEnv("DB_HOST", "localhost")
	DBPort := getEnv("DB_PORT", "5432")
	DBName := getEnv("DB_NAME", "ookkee")
	DBUser := getEnv("DB_USER", "ookkeeuser")
	DBPassword := getEnv("DB_PASSWORD", "ookkeepass")
	PORT := getEnv("SERVER_PORT", ":8080")
	UPLOADS_DIR := getEnv("UPLOADS_DIR", "uploads")
	CORSOrigins := getEnv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000")

	// Ensure port has colon prefix
	if PORT[0] != ':' {
		PORT = ":" + PORT
	}

	// Initialize database
	databaseURL := fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable",
		DBUser, DBPassword, DBHost, DBPort, DBName)

	if err := database.Initialize(databaseURL); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer database.Close()

	// Migrations are now handled by Flyway in startup.sh
	log.Println("Database migrations handled by Flyway at startup")

	// Setup router
	r := chi.NewRouter()

	// Middleware
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{CORSOrigins},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	// Routes
	r.Route("/api", func(r chi.Router) {
		// Upload
		r.Post("/upload", handlers.FileUpload)
		
		// Health
		r.Get("/health", handlers.Health)
		
		// Projects
		r.Get("/projects", handlers.GetProjects)
		r.Get("/projects/{projectID}/expenses", handlers.GetExpenses)
		r.Put("/projects/{projectID}", handlers.UpdateProject)
		r.Delete("/projects/{projectID}", handlers.DeleteProject)
		
		// Categories
		r.Get("/categories", handlers.GetCategories)
		r.Post("/categories", handlers.CreateCategory)
		r.Put("/categories/{categoryID}", handlers.UpdateCategory)
		r.Delete("/categories/{categoryID}", handlers.DeleteCategory)
		r.Put("/categories/{categoryID}/move", handlers.MoveCategory)
	})

	// Ensure uploads directory exists
	if err := os.MkdirAll(UPLOADS_DIR, 0755); err != nil {
		log.Fatalf("Failed to create uploads directory: %v", err)
	}

	fmt.Printf("Server starting on port %s\n", PORT)
	log.Fatal(http.ListenAndServe(PORT, r))
}

func getEnv(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultValue
}