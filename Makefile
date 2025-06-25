# Ookkee Makefile

.PHONY: help up down logs test test-backend test-frontend migrate clean dev-setup

# Default target
help:
	@echo "Ookkee Development Commands:"
	@echo ""
	@echo "  dev-setup       Set up development environment"
	@echo "  up              Start all services with Docker Compose"
	@echo "  down            Stop all services"
	@echo "  logs            View logs from all services"
	@echo "  test            Run all tests"
	@echo "  test-backend    Run Go tests"
	@echo "  test-frontend   Run React tests"
	@echo "  migrate         Run database migrations"
	@echo "  clean           Remove all containers and volumes"
	@echo ""
	@echo "Environment Management:"
	@echo "  source ./env.sh development  # Load dev environment"
	@echo "  source ./env.sh docker       # Load docker environment"
	@echo "  source ./env.sh production   # Load prod environment"
	@echo ""

# Start all services
up:
	@if [ ! -f config/.envrc.docker ]; then \
		cp config/.envrc.example config/.envrc.docker; \
		echo "Created config/.envrc.docker from template"; \
		echo "Please edit config/.envrc.docker with your settings if needed"; \
	fi
	@echo "Loading Docker environment and starting services..."
	@bash -c 'source ./env.sh docker && docker compose up -d'
	@echo "Services started!"
	@echo "Frontend: http://localhost:5173"
	@echo "Backend:  http://localhost:8080"
	@echo "Database: localhost:5432"

# Stop all services
down:
	@bash -c 'source ./env.sh docker && docker compose down'

# View logs
logs:
	@bash -c 'source ./env.sh docker && docker compose logs -f'

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

# Set up development environment
dev-setup:
	@echo "Setting up Ookkee development environment..."
	@if [ ! -f config/.envrc.development ]; then \
		cp config/.envrc.example config/.envrc.development; \
		echo "Created config/.envrc.development - please edit with your settings"; \
	fi
	@echo "Environment setup complete!"
	@echo "Next steps:"
	@echo "  1. Edit config/.envrc.development with your settings"
	@echo "  2. Run: source ./env.sh development"
	@echo "  3. Run: make up"

# Development helpers
dev-backend:
	@echo "Loading development environment..."
	@source ./env.sh development && cd backend && go run main.go

dev-frontend:
	@echo "Loading development environment..."
	@source ./env.sh development && cd frontend && npm run dev

dev-db:
	docker run --rm -d --name ookkee-dev-db \
		-e POSTGRES_DB=ookkee \
		-e POSTGRES_USER=postgres \
		-e POSTGRES_PASSWORD=postgres \
		-p 5432:5432 \
		postgres:15
