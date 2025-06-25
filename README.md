# Ookkee

> The only word in English with three consecutive double letters: bo**okk**eeper

A modern AI bookkeeping assistant with PostgreSQL backend and Google Sheets-like interface for processing CSV financial data.

## Features

- **PostgreSQL Integration**: Full database storage with pgx driver
- **Google Sheets Interface**: Infinite scrolling spreadsheet view
- **Project Management**: Left navigation for multiple CSV uploads
- **Smart CSV Processing**: Automatic parsing and database import
- **Modern Architecture**: React + Vite frontend, Go + Chi backend

## Quick Start with Docker

```bash
# Clone and setup
git clone <repository-url>
cd ookkee

# Setup environment (first time)
make dev-setup
# Edit config/.envrc.development with your settings

# Start with Docker (recommended)
source ./env.sh docker && docker compose up

# Or start with make (which loads environment automatically)
make up

# Access the application
open http://localhost:5173
```

That's it! The application will be running with:
- Frontend: http://localhost:5173
- Backend API: http://localhost:8080
- PostgreSQL: localhost:5432

## Running Tests

```bash
# Run all tests (unit + integration)
make test

# Run individual test suites
make test-backend      # Go unit tests
make test-frontend     # React component tests
make test-integration  # Full stack API tests

# Frontend test options
cd frontend
npm run test           # Run tests once
npm run test:ui        # Interactive test UI
npm run test:coverage  # With coverage report
```

### Test Coverage

**Backend Tests:**
- API endpoint validation
- CORS configuration
- Database integration (when available)

**Frontend Tests:**
- Component rendering
- File upload validation
- User interactions

**Integration Tests:**
- API health checks
- Database connectivity
- Frontend accessibility
- File upload workflow

## Database Migrations

**Migrations run automatically** when the Go backend starts up. No manual steps needed!

```bash
# Just start the services and migrations happen automatically
make up

# Check that migrations worked
curl http://localhost:8080/api/health
```

The backend creates all tables, indexes, and default data on first startup.

## Project Structure

```
├── frontend/              # React + Vite frontend
│   ├── src/components/
│   │   ├── FileUpload.jsx     # Drag-and-drop CSV upload
│   │   ├── ProjectsSidebar.jsx # Left navigation
│   │   └── SpreadsheetView.jsx # Google Sheets-like table
│   └── Dockerfile
├── backend/               # Go + Chi + pgx backend
│   ├── main.go           # API server with database integration
│   └── Dockerfile
├── db/migrations/         # Database schema
├── docker-compose.yml     # Full stack orchestration
└── uploads/               # CSV file storage
```

## Manual Development Setup

If you prefer to run without Docker:

### Prerequisites
- Node.js 18+
- Go 1.21+
- PostgreSQL 15+

### Backend Setup
```bash
cd backend
go mod tidy

# Set up PostgreSQL database
creatdb ookkee
psql ookkee < ../db/migrations/001_initial_schema.sql

# Start backend
go run main.go
```

### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

## Usage

1. **Upload CSV**: Click "+ Upload CSV" or drag files to the upload area
2. **View Projects**: All uploaded CSVs appear in the left sidebar
3. **Browse Data**: Click any project to see the spreadsheet view
4. **Infinite Scroll**: Large datasets load progressively (50 rows at a time)

## API Endpoints

- `GET /api/health` - Service health check
- `GET /api/projects` - List all projects
- `GET /api/projects/{id}/expenses` - Get expense data with pagination
- `POST /api/upload` - Upload and process CSV files

## Database Schema

- **project**: Metadata for each uploaded CSV
- **expense**: Individual rows from CSV files
- **expense_category**: Categories for AI classification (future)
- **expense_history**: Audit trail for AI suggestions (future)

## Technical Stack

- **Frontend**: React 18, Vite, Modern CSS
- **Backend**: Go 1.21, Chi router, pgx PostgreSQL driver
- **Database**: PostgreSQL 15 with JSONB support
- **Infrastructure**: Docker Compose for orchestration

## Performance

- Handles 2000+ row CSV files efficiently
- Pagination prevents memory issues with large datasets
- Infinite scrolling provides smooth UX
- PostgreSQL JSONB for flexible CSV schema storage

## Future Roadmap

- AI-powered expense categorization
- User authentication and multi-tenancy
- Advanced filtering and search
- Export functionality
- Dashboard and analytics

## Contributing

This is the foundation release with core CSV processing and UI. Ready for AI features and advanced bookkeeping functionality.
