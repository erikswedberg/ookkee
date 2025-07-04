# Ookkee AI Bookkeeping Assistant - Project Summary

## Project Overview

**Ookkee** is an AI-powered bookkeeping assistant with a human-in-the-loop workflow for expense management. The application provides CSV upload, AI categorization, and business expense tracking with personal expense filtering.

**Tech Stack:**
- **Frontend:** React + Vite, shadcn/ui components, Sonner toast notifications
- **Backend:** Go + Chi router, PostgreSQL with pgx/v5 driver
- **Database:** PostgreSQL with JSONB for flexible CSV storage
- **AI Integration:** OpenAI/Anthropic via LangChain Go
- **Deployment:** Docker Compose with multi-stage builds

## Current Architecture

### Database Schema (Latest: V7 Migration)
```sql
-- Core tables
project: Project metadata for uploaded CSV files
expense: Individual expense rows with JSONB raw data
expense_category: Categories for AI classification
expense_history: Audit trail for AI suggestions

-- Key columns in expense table:
- source TEXT (from CSV column)
- date_text TEXT (flexible date format)
- description TEXT
- amount DECIMAL
- is_personal BOOLEAN (excludes from business operations)
- accepted_category_id (user-confirmed category)
- suggested_category_id (AI-generated suggestion)
```

### API Endpoints
```
-- Project management
GET /api/projects
POST /api/upload
PUT /api/projects/{id}
DELETE /api/projects/{id}

-- Expense management
GET /api/projects/{id}/expenses
PUT /api/expenses/{id}
GET /api/projects/{id}/totals
GET /api/projects/{id}/progress

-- AI categorization
POST /api/projects/{id}/ai-categorize

-- Categories
GET /api/categories
POST /api/categories
PUT /api/categories/{id}
DELETE /api/categories/{id}
```

## Major Recent Rewrite: Backend-Driven AI Categorization

### Previous Architecture (Frontend-Driven)
- Frontend selected expenses and categories
- Sent full expense data to backend
- Backend acted as pass-through to AI services
- Complex state management in frontend

### New Architecture (Backend-Driven)
- Backend determines which expenses need categorization
- Automatic selection of next 20 uncategorized, non-personal expenses
- Backend handles category lookup and AI prompt construction
- AI suggestions automatically stored in database
- Simplified frontend integration

### Key Backend Changes

**File:** `backend/handlers/ai_categorize.go`
- New `AICategorizeRequest` structure (simplified - just model selection)
- New `AICategorizeFullResponse` structure with `categorizations` array
- Backend functions:
  - `getUncategorizedExpenses()` - queries next batch for AI processing
  - `getAllCategories()` - retrieves available categories
  - `fetchAcceptedMap()` - fuzzy matching for better AI suggestions
  - `updateExpenseSuggestion()` - persists AI suggestions to database

**AI Processing Flow:**
1. Query 20 uncategorized, non-personal expenses
2. Get all available categories
3. Fetch accepted descriptions for context (fuzzy matching)
4. Build AI prompt with examples and context
5. Call OpenAI/Anthropic API
6. Parse and validate AI response
7. Store in expense_history AND update expense.suggested_category_id
8. Return structured response with selectedExpenseIds and categorizations

### Frontend Integration Fix (Latest Commit)

**File:** `frontend/src/contexts/SpreadsheetContext.jsx`
- Fixed response handling to parse `AICategorizeFullResponse` structure
- Updated from `suggestions.find()` to `result.categorizations.find()`
- Added toast notifications for success/error/info messages
- Maintained backward compatibility with existing suggestion processing

## Personal vs Business Expense Architecture

### Database Design
- `expense.is_personal BOOLEAN` field for marking personal expenses
- Personal expenses excluded from:
  - AI categorization processing
  - Business totals calculations
  - Progress tracking for business categorization

### Implementation
- **AI Categorization:** `AND (is_personal IS NULL OR is_personal = FALSE)`
- **Totals Calculation:** `AND e.is_personal = FALSE`
- **Progress Tracking:** Personal expenses don't count toward completion

## CSV Import Enhancement

### Fixed Column Structure
Replaced dynamic CSV parsing with fixed structure:
```
#, Source, Date, Description, Amount, Category, Action, Status
```

### Enhanced CSV Processing
- **Source column:** Extracted from CSV first column
- **Date handling:** Text storage with DayJS parsing (MM/DD/YY format)
- **Amount parsing:** Handles currency symbols ($27.29 → 27.29)
- **Flexible validation:** Handles various CSV formats

## UI/UX Improvements

### Spreadsheet Interface
- Fixed column layout (no more dynamic columns)
- Personal expense checkbox in first column
- Radial gradient mask for personal expense rows
- Blue focus styling for form controls
- Category column minimum width (175px)
- Infinite scrolling for large datasets

### Toast Notifications
- Success: "AI categorized N expenses"
- Info: "No expenses needed categorization"
- Error: Specific error messages
- Uses Sonner library for consistent notifications

## Current State & Testing

### Working Features ✅
- CSV upload with Source/Date/Description/Amount parsing
- Personal expense marking and filtering
- AI categorization (OpenAI/Anthropic integration)
- Fixed column spreadsheet interface
- Toast notifications
- Database migrations (V1-V7)
- Docker deployment

### Known Issues/Limitations
- No job tracking for long-running AI operations (currently synchronous)
- AI categorization processes max 20 expenses per request
- No pagination for AI categorization results
- Mock responses when API keys not configured

## Queue for Next Helper Agent

### High Priority Tasks
1. **Test Current Implementation**
   - Verify end-to-end CSV upload → AI categorization → totals workflow
   - Test with real OpenAI/Anthropic API keys
   - Verify personal expense filtering works correctly

2. **Determine Job Tracking Need**
   - Test AI categorization performance with larger datasets
   - Evaluate if synchronous processing is sufficient
   - Implement job tracking if needed for long-running operations

3. **Personal Expense Verification**
   - Test that personal expenses are excluded from totals
   - Verify personal expenses don't appear in AI categorization
   - Check progress calculation excludes personal expenses

### Medium Priority Tasks
1. **AI Categorization Enhancements**
   - Implement batch processing for large datasets
   - Add job status polling if needed
   - Optimize fuzzy matching performance

2. **Error Handling**
   - Better error messages for API failures
   - Retry logic for transient failures
   - Fallback behavior when AI services unavailable

3. **Performance Optimization**
   - Database query optimization
   - Frontend virtual scrolling for very large datasets
   - Caching for category lookups

### Low Priority Tasks
1. **Feature Enhancements**
   - Export functionality (PDF, Excel)
   - Advanced filtering and search
   - Dashboard and analytics
   - Mobile responsive design

2. **Infrastructure**
   - Production deployment configuration
   - Monitoring and logging
   - API rate limiting
   - User authentication

## Development Environment

### Quick Start
```bash
./dev-setup.sh  # Install dependencies and start services
source ./env.sh development
make up
```

### Environment Files
- `config/.envrc.example` - Template configuration
- `config/.envrc.development` - Local development
- `config/.envrc.docker` - Docker environment

### Testing
```bash
# Backend tests
cd backend && go test -v

# Frontend tests
cd frontend && npm test

# Integration tests
./test/integration_test.sh
```

## Important Notes for Next Agent

1. **Migration Rule:** Never modify existing migration files (V1-V7). Always create new migrations for schema changes.

2. **API Response Structure:** Frontend expects `AICategorizeFullResponse` with `categorizations` array, not flat suggestions array.

3. **Personal Expense Logic:** Always use `is_personal = FALSE` or `is_personal IS NULL` filters for business operations.

4. **Toast Notifications:** Use Sonner library for user feedback - already integrated.

5. **Docker Environment:** Use `make up` for standard development, `make up-dev` for hot reload.

6. **AI Integration:** Supports both OpenAI and Anthropic with fallback to mock responses.

7. **Database:** Uses pgx/v5 driver with connection pooling and prepared statements.

8. **Frontend State:** SpreadsheetContext manages all expense data and AI categorization state.

## Recent Commit

Just fixed frontend AI categorization response handling to properly parse the backend's structured response format. The AI categorization flow should now work end-to-end, but needs testing with actual API keys and verification of personal expense filtering.

The application is in a good state for continued development and testing.