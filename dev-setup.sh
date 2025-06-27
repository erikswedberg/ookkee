#!/bin/bash

# Ookkee Development Environment Setup Script
# This script sets up the complete development environment without Docker

set -e  # Exit on any error

echo "🚀 Starting Ookkee development environment setup..."
echo

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root (needed for package installation)
if [ "$EUID" -ne 0 ]; then
    log_error "This script needs to run as root for package installation"
    log_info "Please run: sudo $0"
    exit 1
fi

# Step 1: Install dependencies
log_info "Installing system dependencies..."
apt update
apt install -y postgresql postgresql-contrib golang nodejs npm default-jre wget

if [ $? -ne 0 ]; then
    log_error "Failed to install system packages"
    exit 1
fi

# Step 2: Start PostgreSQL
log_info "Starting PostgreSQL service..."
service postgresql start

if [ $? -ne 0 ]; then
    log_error "Failed to start PostgreSQL"
    exit 1
fi

# Step 3: Install Flyway
log_info "Installing Flyway..."
wget -qO- https://repo1.maven.org/maven2/org/flywaydb/flyway-commandline/9.16.0/flyway-commandline-9.16.0-linux-x64.tar.gz | tar -xzC /opt/
ln -sf /opt/flyway-9.16.0/flyway /usr/local/bin/flyway

if [ ! -x "/usr/local/bin/flyway" ]; then
    log_error "Failed to install Flyway"
    exit 1
fi

# Step 4: Setup database
log_info "Setting up database and user..."
sudo -u postgres createdb ookkee 2>/dev/null || log_warn "Database ookkee already exists"
sudo -u postgres psql -c "CREATE USER postgres;" 2>/dev/null || log_warn "User postgres already exists"
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ookkee TO postgres;"
sudo -u postgres psql -c "ALTER USER postgres CREATEDB;"

# Step 5: Create development environment config
log_info "Creating development environment configuration..."
if [ ! -f config/.envrc.development ]; then
    cat > config/.envrc.development << 'EOF'
# Ookkee Environment Configuration - Development

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ookkee
DB_USER=postgres
DB_PASSWORD=postgres

# Server Configuration
SERVER_PORT=8080
UPLOADS_DIR=uploads

# Frontend Configuration
VITE_API_URL=http://localhost:8080

# CORS Configuration  
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
EOF
fi

# Step 6: Run database migrations
log_info "Running database migrations..."
source ./env.sh development
flyway -configFiles=flyway.conf migrate

if [ $? -ne 0 ]; then
    log_error "Failed to run database migrations"
    exit 1
fi

# Step 7: Install frontend dependencies
log_info "Installing frontend dependencies..."
cd frontend
npm install
cd ..

if [ $? -ne 0 ]; then
    log_error "Failed to install frontend dependencies"
    exit 1
fi

# Step 8: Start services in background
log_info "Starting backend and frontend services..."

# Start backend
source ./env.sh development
cd backend
nohup go run main.go > ../backend.log 2>&1 &
BACKEND_PID=$!
cd ..

# Start frontend  
cd frontend
nohup npm run dev > ../frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..

# Wait for services to start
log_info "Waiting for services to start..."
sleep 10

# Check if services are running
if kill -0 $BACKEND_PID 2>/dev/null; then
    log_info "✅ Backend started (PID: $BACKEND_PID)"
else
    log_error "❌ Backend failed to start"
    log_info "Check backend.log for errors"
fi

if kill -0 $FRONTEND_PID 2>/dev/null; then
    log_info "✅ Frontend started (PID: $FRONTEND_PID)"
else
    log_error "❌ Frontend failed to start"
    log_info "Check frontend.log for errors"
fi

echo
log_info "🎉 Development environment setup complete!"
echo
echo "📍 Service URLs:"
echo "   Frontend: http://localhost:5173"
echo "   Backend:  http://localhost:8080"
echo "   Database: localhost:5432 (ookkee/postgres/postgres)"
echo
echo "📊 Service Status:"
echo "   Backend PID:  $BACKEND_PID"
echo "   Frontend PID: $FRONTEND_PID"
echo
echo "📝 Logs:"
echo "   Backend:  tail -f backend.log"
echo "   Frontend: tail -f frontend.log"
echo
echo "🛑 To stop services:"
echo "   kill $BACKEND_PID $FRONTEND_PID"
echo
log_info "You can now test the file upload functionality!"
