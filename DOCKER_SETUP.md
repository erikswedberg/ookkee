# Docker Setup Guide for Ookkee

**Quick start guide to get all 3 containers running with test data loaded**

## Prerequisites

- Docker installed and available
- This repository cloned locally
- Large test data file exists: `uploads/20250624_042217_large-test-data.csv` (117 rows)

## Quick Start Steps

### 1. Start Docker Daemon

```bash
dockerd &
sleep 5  # Wait for daemon to be ready
```

### 2. Start Database Container

```bash
docker run -d --name ookkee-db --network=host \
  -e POSTGRES_DB=ookkee \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -v $PWD/data/postgres:/var/lib/postgresql/data \
  postgres:15
```

### 3. Build and Run Database Migrations

```bash
# Build migration container
cd backend
docker build -f Dockerfile.migration --network=host -t ookkee-migration .
cd ..

# Run migrations
docker run --network=host \
  -e DB_HOST=localhost \
  -e DB_PORT=5432 \
  -e DB_NAME=ookkee \
  -e DB_USER=postgres \
  -e DB_PASSWORD=postgres \
  -v $PWD/db/migrations:/flyway/sql \
  ookkee-migration
```

**Expected output**: ✅ "Migrations completed successfully!" with 7 migrations applied (V1-V7)

### 4. Build and Start Backend Container

```bash
# Build backend
cd backend
docker build --network=host -t ookkee-backend .
cd ..

# Start backend
docker run -d --name ookkee-backend --network=host \
  -e DB_HOST=localhost \
  -e DB_PORT=5432 \
  -e DB_NAME=ookkee \
  -e DB_USER=postgres \
  -e DB_PASSWORD=postgres \
  -e SERVER_PORT=8080 \
  -e UPLOADS_DIR=uploads \
  -e CORS_ORIGINS="http://localhost:5173,http://localhost:3000" \
  -v $PWD/uploads:/app/uploads \
  ookkee-backend
```

### 5. Build and Start Frontend Container

```bash
# Build frontend
cd frontend
docker build --network=host -t ookkee-frontend .
cd ..

# Start frontend
docker run -d --name ookkee-frontend --network=host ookkee-frontend
```

### 6. Load Test Data

Upload the existing large test data file (117 expense rows):

```bash
curl -X POST http://localhost:8080/api/upload \
  -F "file=@uploads/20250624_042217_large-test-data.csv" \
  -F "projectName=Large Test Dataset"
```

## Verification

### Check All Containers Running

```bash
docker ps
```

**Expected output**: 3 containers running:
- `ookkee-db` (postgres:15)
- `ookkee-backend` (ookkee-backend) 
- `ookkee-frontend` (ookkee-frontend)

### Test API Endpoints

```bash
# Health check
curl http://localhost:8080/api/health
# Expected: {"status":"healthy"}

# Check projects
curl http://localhost:8080/api/projects
# Expected: JSON with "Large Test Dataset" project

# Frontend accessibility
curl -I http://localhost:5173
# Expected: HTTP/1.1 200 OK
```

### Access Application

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8080

**Expected Result**: 
- Left sidebar shows "Large Test Dataset" project
- Main table displays 117 expense rows with office rent, retainers, software licenses, etc.
- Virtual scrolling handles the large dataset smoothly

## Troubleshooting

### If `make up` Fails

The standard `make up` command may fail in containerized environments due to Docker networking issues. Use the manual steps above instead.

### Container Name Conflicts

If containers already exist:

```bash
docker rm -f ookkee-db ookkee-backend ookkee-frontend
```

### Network Issues

Always use `--network=host` flag for both builds and runs in containerized environments.

### Database Connection Issues

Ensure database is ready before starting backend:

```bash
# Check database logs
docker logs ookkee-db | tail -5
# Look for "database system is ready to accept connections"
```

## Clean Up

To stop and remove all containers:

```bash
docker rm -f ookkee-db ookkee-backend ookkee-frontend
```

To remove built images:

```bash
docker rmi ookkee-migration ookkee-backend ookkee-frontend
```

## Why Manual Setup?

The standard `make up` Docker Compose approach fails in some containerized environments due to bridge networking limitations. This manual approach using host networking provides a reliable alternative that works in all environments.
