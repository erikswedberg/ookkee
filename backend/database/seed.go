package database

import (
	"context"
	"log"
)

// SeedDefaultCategories is deprecated - seeding is now handled by Flyway migrations
// This function is kept for backwards compatibility but does nothing
func SeedDefaultCategories(ctx context.Context) error {
	log.Println("Seeding is now handled by Flyway migrations - skipping Go-based seeding")
	return nil
}
