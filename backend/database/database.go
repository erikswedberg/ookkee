package database

import (
	"context"
	"fmt"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"
)

var Pool *pgxpool.Pool

func Initialize(databaseURL string) error {
	var err error
	Pool, err = pgxpool.New(context.Background(), databaseURL)
	if err != nil {
		return fmt.Errorf("failed to create connection pool: %w", err)
	}

	// Test the connection
	if err = Pool.Ping(context.Background()); err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}

	log.Println("Database connection established")
	return nil
}

func Close() {
	if Pool != nil {
		Pool.Close()
	}
}

// RunMigrations is deprecated - we now use Flyway for migrations
// This function is kept for backwards compatibility but does nothing
func RunMigrations(ctx context.Context) error {
	log.Println("Migrations are now handled by Flyway - skipping Go-based migrations")
	return nil
}
