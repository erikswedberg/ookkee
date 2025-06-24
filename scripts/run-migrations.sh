#!/bin/bash
# run-migrations.sh - Run database migrations in Docker

set -e

echo "🔄 Running Ookkee database migrations..."

# Check if Docker Compose is running
if ! docker compose ps db | grep -q "Up"; then
    echo "❌ Database service is not running. Start it first with:"
    echo "   docker compose up -d db"
    exit 1
fi

# Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
docker compose exec -T db pg_isready -U postgres -d ookkee

echo "📊 Migrations run automatically by Go backend!"
echo "✅ No manual migration needed."

echo "✅ Database is ready!"
echo ""
echo "You can now:"
echo "  - Start all services: docker compose up -d"
echo "  - View the app: http://localhost:5173"
echo "  - Check API: http://localhost:8080/api/health"
