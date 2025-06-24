# Ookkee Makefile

.PHONY: help up down logs test test-backend test-frontend migrate clean

# Default target
help:
	@echo "Ookkee Development Commands:"
	@echo ""
	@echo "  up              Start all services with Docker Compose"
	@echo "  down            Stop all services"
	@echo "  logs            View logs from all services"
	@echo "  test            Run all tests"
	@echo "  test-backend    Run Go tests"
	@echo "  test-frontend   Run React tests"
	@echo "  migrate         Run database migrations"
	@echo "  clean           Remove all containers and volumes"
	@echo ""

# Start all services
up:
	docker compose up -d
	@echo "Services started!"
	@echo "Frontend: http://localhost:5173"
	@echo "Backend:  http://localhost:8080"
	@echo "Database: localhost:5432"

# Stop all services
down:
	docker compose down

# View logs
logs:
	docker compose logs -f

# Run all tests
test: test-backend test-frontend test-integration

# Run backend tests
test-backend:
	@echo "Running Go tests..."
	cd backend && go test -v ./...

# Run frontend tests
test-frontend:
	@echo "Running React tests..."
	cd frontend && npm test

# Run integration tests
test-integration:
	@echo "Running integration tests..."
	./test/integration_test.sh

# Run database migrations manually
migrate:
	@echo "Migrations run automatically by Go backend on startup"
	@echo "No manual migration needed!"

# Clean up everything
clean:
	docker compose down -v
	docker compose rm -f
	docker volume prune -f

# Development helpers
dev-backend:
	cd backend && go run main.go

dev-frontend:
	cd frontend && npm run dev

dev-db:
	docker run --rm -d --name ookkee-dev-db \
		-e POSTGRES_DB=ookkee \
		-e POSTGRES_USER=postgres \
		-e POSTGRES_PASSWORD=postgres \
		-p 5432:5432 \
		-v $(PWD)/db/migrations:/docker-entrypoint-initdb.d \
		postgres:15
