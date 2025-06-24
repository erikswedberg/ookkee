#!/bin/bash
# Simple migration script for Ookkee

DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-ookkee}
DB_USER=${DB_USER:-postgres}
DB_PASSWORD=${DB_PASSWORD:-postgres}

echo "Running migrations for Ookkee database..."

# Check if database is accessible
echo "Checking database connection..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT version();" > /dev/null 2>&1

if [ $? -ne 0 ]; then
    echo "Error: Cannot connect to database"
    echo "Make sure PostgreSQL is running and accessible at $DB_HOST:$DB_PORT"
    exit 1
fi

echo "Database connection successful!"

# Run migrations in order
for migration in db/migrations/*.sql; do
    if [ -f "$migration" ]; then
        echo "Running migration: $(basename $migration)"
        PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f "$migration"
        if [ $? -ne 0 ]; then
            echo "Error: Migration failed: $migration"
            exit 1
        fi
    fi
done

echo "All migrations completed successfully!"
