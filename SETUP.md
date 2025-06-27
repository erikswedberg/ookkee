# Ookkee Development Environment Setup

## 🚀 Quick Start (Recommended)

```bash
sudo ./dev-setup.sh
```

This automated script will:
- Install all dependencies (PostgreSQL, Go, Node.js, Flyway)
- Set up the database and run migrations
- Start backend and frontend services
- Give you working URLs to test with

**Expected output:**
```
🎉 Development environment setup complete!

📍 Service URLs:
   Frontend: http://localhost:5173
   Backend:  http://localhost:8080
   Database: localhost:5432 (ookkee/postgres/postgres)

📊 Service Status:
   Backend PID:  12345
   Frontend PID: 12346

📝 Logs:
   Backend:  tail -f backend.log
   Frontend: tail -f frontend.log

🛑 To stop services:
   kill 12345 12346
```

## 🔧 Manual Setup (Fallback)

If the automated script fails, follow these manual steps:

### 1. Install Dependencies

```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib golang nodejs npm default-jre wget
```

### 2. Start PostgreSQL

```bash
sudo service postgresql start
```

### 3. Install Flyway

```bash
wget -qO- https://repo1.maven.org/maven2/org/flywaydb/flyway-commandline/9.16.0/flyway-commandline-9.16.0-linux-x64.tar.gz | sudo tar -xzC /opt/
sudo ln -sf /opt/flyway-9.16.0/flyway /usr/local/bin/flyway
```

### 4. Setup Database

```bash
sudo -u postgres createdb ookkee
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ookkee TO postgres;"
sudo -u postgres psql -c "ALTER USER postgres CREATEDB;"
```

### 5. Create Development Configuration

Create `config/.envrc.development`:

```bash
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
```

### 6. Run Database Migrations

```bash
source ./env.sh development
flyway -configFiles=flyway.conf migrate
```

### 7. Install Frontend Dependencies

```bash
cd frontend
npm install
cd ..
```

### 8. Start Services

**Option A: Background processes (like the script)**

```bash
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

echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo "Frontend: http://localhost:5173"
echo "Backend: http://localhost:8080"
```

**Option B: Separate terminals**

```bash
# Terminal 1 - Backend
source ./env.sh development && cd backend && go run main.go

# Terminal 2 - Frontend  
cd frontend && npm run dev
```

## 🐳 Docker Setup (Alternative)

If you prefer Docker:

```bash
# First-time setup
make dev-setup
source ./env.sh development

# Start all services
make up

# For development with hot reload
make up-dev
```

## 🧪 Testing the Setup

Once services are running:

1. **Visit Frontend**: http://localhost:5173
2. **Test Backend**: http://localhost:8080/api/health
3. **Test File Upload**:
   - Click the "+" button in the Projects section
   - Enter a project name
   - Select a CSV file (or use `test-data.csv`)
   - Click "Upload File"
   - Click "Create Project"
   - Project should appear in the sidebar

## 🔍 Troubleshooting

**Backend won't start:**
```bash
tail -f backend.log
# Check for database connection issues
```

**Frontend won't start:**
```bash
tail -f frontend.log
# Check for npm dependency issues
```

**Database connection fails:**
```bash
# Check PostgreSQL is running
sudo service postgresql status

# Test connection manually
psql -h localhost -U postgres -d ookkee
```

**Migrations fail:**
```bash
# Check Flyway installation
flyway --version

# Check database connection
psql -h localhost -U postgres -d ookkee -c "SELECT 1;"
```

## 🛑 Stopping Services

**If using background processes:**
```bash
# Kill by PID (shown in script output)
kill <BACKEND_PID> <FRONTEND_PID>

# Or kill all Go and npm processes
pkill -f "go run main.go"
pkill -f "npm run dev"
```

**If using separate terminals:**
- Press `Ctrl+C` in each terminal

## 📁 Project Structure

After setup, your environment includes:

- **Frontend**: React + Vite (http://localhost:5173)
- **Backend**: Go + Chi router (http://localhost:8080)
- **Database**: PostgreSQL (localhost:5432)
- **Migrations**: Flyway-managed SQL files
- **Uploads**: Local filesystem storage
- **Config**: Environment-specific settings
- **Logs**: `backend.log` and `frontend.log`
