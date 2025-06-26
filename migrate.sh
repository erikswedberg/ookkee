#!/bin/bash
# Flyway migration script for Ookkee

DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-ookkee}
DB_USER=${DB_USER:-postgres}
DB_PASSWORD=${DB_PASSWORD:-postgres}

echo "Running Flyway migrations for Ookkee database..."

# Check if Flyway is installed
if ! command -v flyway &> /dev/null; then
    echo "Error: Flyway is not installed."
    echo "Please install Flyway CLI from: https://flywaydb.org/download/"
    echo "Or run with Docker: docker run --rm --network=host -v \$(pwd)/db/migrations:/flyway/sql flyway/flyway:10 ..."
    exit 1
fi

# Check if database is accessible
echo "Checking database connection..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT version();" > /dev/null 2>&1

if [ $? -ne 0 ]; then
    echo "Error: Cannot connect to database"
    echo "Make sure PostgreSQL is running and accessible at $DB_HOST:$DB_PORT"
    exit 1
fi

echo "Database connection successful!"

# Run Flyway migrations
echo "Running Flyway migrations..."
flyway -url="jdbc:postgresql://$DB_HOST:$DB_PORT/$DB_NAME" \
       -user="$DB_USER" \
       -password="$DB_PASSWORD" \
       -locations="filesystem:./db/migrations" \
       migrate

if [ $? -eq 0 ]; then
    echo "✅ All migrations completed successfully!"
else
    echo "❌ Migration failed!"
    exit 1
fi
