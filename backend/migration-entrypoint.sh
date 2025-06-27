#!/bin/bash
# Migration entrypoint script for Flyway migrations

set -e

echo "📊 Starting Flyway migrations..."

# Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
while ! nc -z "$DB_HOST" "$DB_PORT"; do
  echo "Database not ready, waiting..."
  sleep 2
done
echo "✅ Database is ready!"

# Run Flyway migrations
echo "🚀 Running Flyway migrations..."
flyway -url="jdbc:postgresql://$DB_HOST:$DB_PORT/$DB_NAME" \
       -user="$DB_USER" \
       -password="$DB_PASSWORD" \
       -locations="filesystem:/flyway/sql" \
       -connectRetries=60 \
       migrate

if [ $? -eq 0 ]; then
    echo "✅ Migrations completed successfully!"
    exit 0
else
    echo "❌ Migration failed!"
    exit 1
fi
