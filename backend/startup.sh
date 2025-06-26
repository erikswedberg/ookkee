#!/bin/bash
# Startup script for Ookkee backend with Flyway migrations

set -e

echo "🚀 Starting Ookkee backend..."

# Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
while ! nc -z "$DB_HOST" "$DB_PORT"; do
  echo "Database not ready, waiting..."
  sleep 2
done
echo "✅ Database is ready!"

# Run Flyway migrations
echo "📊 Running database migrations with Flyway..."
flyway -url="jdbc:postgresql://$DB_HOST:$DB_PORT/$DB_NAME" \
       -user="$DB_USER" \
       -password="$DB_PASSWORD" \
       -locations="filesystem:/app/migrations" \
       -connectRetries=60 \
       migrate

if [ $? -eq 0 ]; then
    echo "✅ Migrations completed successfully!"
else
    echo "❌ Migration failed!"
    exit 1
fi

# Start the Go application
echo "🎯 Starting Go backend application..."
exec ./main
