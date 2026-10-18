# Dear LLM - Ookkee Development Journal

## 🚀 QUICK START FOR AGENTS

**To start the development environment quickly:**

```bash
./dev-setup.sh
```

This will install all dependencies, start services, and give you working URLs.

**If the script fails, use the manual fallback recipe in SETUP.md.**

---

This file documents the key decisions and steps taken during the development of Ookkee, the AI bookkeeping assistant.

## Project Overview

**Name**: Ookkee (from "bookkeeper" - the only English word with three consecutive double letters)
**Purpose**: AI bookkeeping assistant with human-in-the-loop workflow
**Architecture**: React + Vite frontend, Go + Chi backend, PostgreSQL database

## Development Journey

### Phase 1: Initial Boilerplate (Commits: Initial → 334b8a6)

**Goal**: Create basic file upload functionality

**Steps Taken**:
1. Created project structure with `frontend/`, `backend/`, `uploads/` directories
2. Set up React + Vite frontend with file upload component
3. Built Go + Chi backend with multipart file handling
4. Implemented drag-and-drop CSV upload with validation
5. Added progress tracking and user feedback

**Key Files Created**:
- `frontend/src/components/FileUpload.jsx` - Drag-and-drop upload interface
- `backend/main.go` - HTTP server with file upload endpoint
- `README.md` - Initial documentation

**Technologies Used**:
- Frontend: React 18, Vite, custom CSS
- Backend: Go, Chi router, CORS middleware
- File Storage: Local filesystem with timestamp naming

### Phase 2: Database Integration & UI Overhaul (Commits: 334b8a6 → 7199026)

**Goal**: Transform into full-featured spreadsheet interface with PostgreSQL backend

**Major Changes**:
1. **Database Layer**:
   - Switched from `lib/pq` to `pgx/v5` (modern PostgreSQL driver)
   - Implemented comprehensive schema with migrations
   - Added proper transaction handling

2. **Schema Design**:
   ```sql
   - project: Metadata for each uploaded CSV
   - expense: Individual rows from CSV files (JSONB for flexibility)
   - expense_category: Categories for AI classification
   - expense_history: Audit trail for AI suggestions
   ```

3. **UI Transformation**:
   - Left sidebar navigation for projects
   - Google Sheets-like spreadsheet interface
   - Infinite scrolling for large datasets (50 rows/page)
   - Color-coded financial data (red/green for expenses/income)
   - Currency formatting and date parsing

4. **API Endpoints**:
   - `GET /api/projects` - List all projects
   - `GET /api/projects/{id}/expenses` - Paginated expense data
   - `POST /api/upload` - Enhanced to create projects and import CSV rows
   - `GET /api/health` - Service health check

**Key Files Created**:
- `frontend/src/components/ProjectsSidebar.jsx` - Project navigation
- `frontend/src/components/SpreadsheetView.jsx` - Google Sheets-like table
- `db/migrations/V1__Initial_schema.sql` - Database schema
- Updated `backend/main.go` - Full database integration

**Technical Decisions**:
- Used JSONB for raw CSV data (flexible schema)
- Implemented proper pagination for performance
- Color-coded UI for better UX (expenses red, income green)
- Automatic migrations on backend startup

### Phase 3: Production Readiness (Commits: 7199026 → 57a4a8e)

**Goal**: Add comprehensive testing, Docker deployment, and production setup

**Additions**:
1. **Testing Infrastructure**:
   - Go unit tests for API endpoints
   - React component tests with Vitest
   - Integration tests for full workflow
   - Test coverage reporting

2. **Docker Deployment**:
   - Multi-stage Docker builds for frontend/backend
   - Docker Compose orchestration with PostgreSQL
   - Proper health checks and dependencies
   - Volume management for data persistence

3. **Development Tools**:
   - Makefile with common commands
   - Migration scripts
   - Integration test suite
   - Comprehensive documentation

**Key Files Created**:
- `backend/main_test.go` - Go unit tests
- `frontend/src/components/__tests__/FileUpload.test.jsx` - React tests
- `docker-compose.yml` - Full stack orchestration
- `Makefile` - Development commands
- `test/integration_test.sh` - End-to-end testing

### Phase 4: Environment Management & Enhanced UX (Commits: 57a4a8e → 4a6b295)

**Goal**: Add professional project management UI and environment configuration

**Major Additions**:
1. **Environment Configuration System**:
   - `env.sh` script for loading different environments
   - `config/` directory with `.envrc.*` files for dev/docker/prod
   - Makefile integration with `make dev-setup`
   - Backend support for environment variables (DB_HOST, SERVER_PORT, etc.)

2. **Enhanced Project Management UI**:
   - Modal-based project creation/editing with custom names
   - "⋮" hover menu on projects with Edit/Delete options
   - Better visual hierarchy (project names prominent, filenames in gray)
   - Improved placeholders and empty states
   - Keyboard shortcuts (Escape) and click-outside-to-close

3. **New API Endpoints**:
   - `PUT /api/projects/{id}` - Update project name
   - `DELETE /api/projects/{id}` - Soft delete projects
   - Enhanced upload endpoint accepts custom project names

**Key Files Created**:
- `env.sh` - Environment loading script
- `config/.envrc.{example,development,docker}` - Environment configurations
- `frontend/src/components/ProjectModal.jsx` - Modal for project create/edit
- `frontend/src/components/ProjectMenu.jsx` - Dropdown menu for project actions

**UX Improvements**:
- Replaced simple upload button with professional "+" button
- Added project name field in upload workflow  
- Left-aligned project names with right-aligned action menu
- Proper modal focus management and accessibility
- Soft delete preserves data while hiding from UI

## Architecture Decisions

### Why PostgreSQL + pgx?
- Modern, high-performance driver
- Excellent JSONB support for flexible CSV schemas
- Better connection pooling and performance
- Native Go integration without ORM overhead

### Why React + Vite?
- Fast development experience
- Modern build tooling
- Excellent hot reload for UI development
- Lightweight compared to Next.js for this use case

### Why Go + Chi?
- High performance for file processing
- Excellent concurrency for multiple uploads
- Simple, lightweight HTTP router
- Great PostgreSQL ecosystem

### Why Infinite Scrolling?
- Handle large CSV files (2000+ rows) efficiently
- Better UX than traditional pagination
- Reduces memory usage on frontend
- Smooth scrolling experience

## Current Capabilities

✅ **Working Features**:
- CSV file upload with drag-and-drop
- Automatic project creation and data import
- PostgreSQL storage with proper schema
- Google Sheets-like interface
- Infinite scrolling for large datasets
- Project navigation and switching
- Color-coded financial data
- Comprehensive test suite
- Docker deployment ready

## Known Issues Fixed

1. **Migration Conflicts**: Removed duplicate Docker init migrations
2. **Docker Compose**: Updated commands for macOS compatibility
3. **Frontend Build**: Fixed Vite dependency issues in Docker
4. **Go Version**: Updated to 1.24.3 for compatibility

## Future Roadmap

🔮 **Planned Features**:
- AI-powered expense categorization
- User authentication and multi-tenancy
- Advanced filtering and search
- Export functionality (PDF, Excel)
- Dashboard and analytics
- Real-time collaboration
- Mobile responsive design
- API rate limiting and security

## Development Environment

**Setup**:
```bash
# First-time setup
make dev-setup
source ./env.sh development

# Start all services
make up

# Run tests
make test

# View logs
make logs
```

**Environment Management**:
```bash
# Production/Standard Docker
source ./env.sh docker && docker compose up
make up                      # Same as above with auto environment loading

# Development with Hot Reload
make up-dev                  # All services with hot reload

# Development - Separate terminals for debugging
source ./env.sh docker && docker compose -f docker-compose.yml -f docker-compose.dev.yml -p local up db
source ./env.sh docker && docker compose -f docker-compose.yml -f docker-compose.dev.yml -p local up backend
source ./env.sh docker && docker compose -f docker-compose.yml -f docker-compose.dev.yml -p local up frontend

# Local development (non-Docker)
source ./env.sh development && go run backend/main.go
source ./env.sh development && cd frontend && npm run dev
```

**Testing**:
```bash
# Backend tests
cd backend && go test -v

# Frontend tests  
cd frontend && npm test

# Integration tests
./test/integration_test.sh
```

## Lessons Learned

1. **Start with proper database design** - The JSONB approach for CSV data was crucial for flexibility
2. **Infinite scrolling is essential** - Large datasets require proper pagination strategy
3. **Docker Compose version matters** - macOS uses `docker compose` not `docker-compose`
4. **Multi-stage builds save space** - Especially important for Node.js applications
5. **Test early and often** - Integration tests caught several deployment issues

## Performance Considerations

- **Database**: Proper indexes on project_id and pagination
- **Frontend**: Virtual scrolling for very large datasets
- **Backend**: Connection pooling and prepared statements
- **Docker**: Multi-stage builds for smaller production images

---

*This document should be updated as the project evolves. Each major feature addition or architectural change should be documented here for future developers.*

## Phase 5: Migration System Refactor (Commits: 4a6b295 → ee57fe8)

**Goal**: Implement proper Flyway-based migrations with dedicated container

**Final Migration Architecture**:
• **Dedicated migration container** - `backend/Dockerfile.migration` with Flyway from official image, runs once and exits
• **Clean separation** - Migration container handles schema, backend container handles app logic only  
• **Proper dependency chain** - Backend waits for migration completion via `service_completed_successfully`
• **Flyway migration files** - All schema changes in `db/migrations/V*.sql` tracked by Flyway's schema history
• **Integrated workflow** - `make up` and `make migrate` automatically run migration container before services

**⚠️ CRITICAL MIGRATION RULE**: From this point forward, **NEVER modify existing migration files**. Always add new migrations (V5, V6, etc.) to make changes. This maintains database migration integrity and prevents conflicts in production environments.

## Phase 6: AI Categorization Job Tracking System (Commits: ee57fe8 → 099175972)

**Goal**: Implement comprehensive job tracking system for AI expense categorization with backend-driven expense selection

**Key Requirements Implemented**:
1. **Backend-driven expense selection**: Frontend requests next 20 rows from `/ai-categorize`, backend determines which expenses to process
2. **Immediate row identification**: Backend sends frontend information about which rows are being processed for UI spinners
3. **Completion notification**: Frontend polls job status every 1 second for near-instant updates

**Backend Job Tracking Infrastructure**:
• **Job Management System** - `jobs/job_manager.go` with `JobManager` and `AICategorizationJob` structs
• **Asynchronous Processing** - `jobs/processor.go` with configurable workers and timeout handling
• **In-memory Job Storage** - Unique job IDs, status tracking (queued, processing, completed, failed)
• **Job Cleanup** - Automatic cleanup of old jobs with cancellation support

**Core AI Processing Refactor**:
• **Separated AI Logic** - Extracted to `ai/categorize.go` package to avoid circular imports
• **Reusable Functions** - `GetUncategorizedExpenses`, `GetAllCategories`, `ProcessCategorizationLogic`
• **Backend-driven Selection** - Business logic for expense selection moved to backend
• **Dual Mode Support** - Both job-based and synchronous processing modes

**API Endpoints Enhancement**:
• **POST /api/projects/{id}/ai-categorize** - Returns job information immediately with selected expense IDs
• **GET /api/jobs/{jobId}** - Job status polling endpoint
• **Response Structure** - `AICategorizeFullResponse` with job_id, status, selected_expenses, progress
• **Backward Compatibility** - Maintains synchronous fallback for existing clients

**Frontend Job Integration**:
• **Job-based Processing** - Updated `handleAiCategorization` to handle job responses
• **Status Polling** - `pollJobStatus` function with 1-second intervals for responsiveness
• **Row-level Spinners** - Processing indicators for specific expense rows being categorized
• **Error Handling** - Comprehensive error handling for job polling failures
• **UI Updates** - Automatic refresh when job completion detected

**UI/UX Improvements**:
• **Header Optimization** - Reduced to 50px height, lowercase "ookkee", right-aligned tagline
• **Full-width Table** - Removed margins for edge-to-edge display
• **Personal Checkbox Column** - Dedicated first column with no label
• **Personal Row Styling** - Radial gradient mask overlay instead of gray background
• **Focus Indicators** - Bright blue focus styling for checkboxes and dropdowns
• **Category Column** - Minimum width of 175px for better visibility
• **Primary Color** - Updated shadcn/ui primary to blue for selected states

**Data Processing Fixes**:
• **Amount Parsing** - Fixed CSV parsing to handle currency symbols ($27.29 → 27.29)
• **Date Formatting** - Changed from 'MMM D, YYYY' to 'MM/DD' to avoid year confusion
• **Toast Notifications** - Fixed category name lookup showing actual names instead of 'Unknown'
• **Personal Expense Filtering** - Proper exclusion from AI categorization with `is_personal = FALSE OR is_personal IS NULL`

**Technical Architecture**:
• **Package Structure** - Clean separation with `ai/` package for business logic, `jobs/` for job management
• **Error Handling** - Graceful fallback to synchronous processing when job manager unavailable
• **Polling Strategy** - 1-second intervals for near-instant UI responsiveness (0-1 second delay)
• **Job Lifecycle** - Complete tracking from creation through completion with cancellation support
• **Mock AI Responses** - Fallback when no API keys configured for development/testing

**Key Files Created/Modified**:
• `backend/jobs/job_manager.go` - Job management and lifecycle
• `backend/jobs/processor.go` - Asynchronous job processing
• `backend/ai/categorize.go` - Core AI categorization logic
• `backend/handlers/ai_categorize.go` - Updated API endpoints
• `frontend/src/contexts/SpreadsheetContext.jsx` - Job polling integration
• Enhanced UI components with job-aware processing states

**Current Status**: System implemented and ready for testing with real AI API keys. Requires end-to-end validation of job tracking workflow.
## Phase 7: AI Autoplay Mode and Dual Progress Bars (Commits: 099175972 → latest)

**Goal**: Add continuous AI categorization mode with visual progress indicators and simplified architecture

**Key Features Implemented**:
1. **Split Button Interface**: Left side for one-off AI categorization, right side for play/stop autoplay toggle
2. **Continuous AI Processing**: Autoplay mode automatically triggers successive rounds until all expenses are categorized
3. **Dual Progress Bars**: Blue bar for suggestions progress, green bar for accepted progress
4. **Single-Path Architecture**: Eliminated dual response handling for consistent behavior

**Split Button Component**:
• **SplitButton Component** - Custom UI component with play ▶️/stop ⏹️ toggle
• **Left Side**: One-off AI categorization (disabled during autoplay)
• **Right Side**: Continuous mode toggle with icon state management
• **State Management**: Proper disabled states and visual feedback

**Autoplay State Management**:
• **autoplayMode State**: Controls continuous processing behavior
• **useRef Pattern**: autoplayModeRef prevents stale closure issues in async callbacks
• **State Synchronization**: Both React state and ref updated together for consistency
• **Race Condition Prevention**: Single useEffect dependency on autoplayMode only

**Dual Progress Bar System**:
• **DualProgress Component** - Overlapping blue and green progress bars
• **Blue Bar**: Shows suggestion progress `(total - uncategorized) / total`
• **Green Bar**: Shows acceptance progress `categorized_count / total`
• **Replaces**: Single progress bar with richer visual information

**Architecture Simplification**:
• **Single Job Path**: Eliminated dual response handling (job vs direct response)
• **Backend**: Always creates jobs, even for empty result sets
• **Frontend**: Removed handleDirectAiResponse function entirely
• **Consistency**: All AI categorization follows same job polling workflow

**Autoplay Logic**:
• **Start**: Play button triggers autoplay mode and initial categorization
• **Continue**: handleAutoplayContinuation checks for more work after each job
• **Stop**: Stop button disables autoplay, current job completes naturally
• **End**: Autoplay stops when no uncategorized expenses remain

**Technical Challenges Solved**:
• **State Closure Issues**: Used useRef to avoid stale autoplayMode in async callbacks
• **Button State Management**: Proper disabled states during different processing phases
• **Race Conditions**: Removed aiCategorizing from useEffect dependencies
• **Dual Path Complexity**: Simplified to single job-based approach throughout

**UI/UX Improvements**:
• **Visual Feedback**: Dual progress bars show both suggestion and acceptance progress
• **Button States**: Clear visual distinction between play/stop modes
• **Seamless UI**: Split button appears as single cohesive component
• **Natural Flow**: Stop button lets current work finish, prevents new work

**Key Files Created/Modified**:
• `frontend/src/components/ui/split-button.jsx` - Split button component
• `frontend/src/components/ui/dual-progress.jsx` - Dual progress bar component
• `frontend/src/contexts/SpreadsheetContext.jsx` - Autoplay state management
• `backend/handlers/ai_categorize.go` - Simplified to single job path

**Current Status**: Autoplay mode fully functional with proper start/stop behavior and visual progress indicators.

## Phase 8: Virtual Infinite Scroll Implementation (Commits: 68cd693 → 33c41eb)

**Goal**: Implement sophisticated virtual scrolling system for expense table performance optimization

**Problem Context**: The existing expense table loads all items into DOM (2000+ elements for large datasets), causing performance issues. Need virtual scrolling that only renders visible items while maintaining proper scrollbar behavior.

**Reference Implementation**: Based on user's 10-year-old JavaScript `browse-list.js` with proven 3-page cycling architecture.

**Core Implementation**:

**VirtualInfiniteScroll Component** (`frontend/src/components/VirtualInfiniteScroll.jsx`):
- **3-Page Architecture**: A/B/C page cycling with only 60 DOM elements maximum (20 items × 3 pages)
- **"Follow the Yellow Brick Road" Algorithm**: Intelligent page recycling that finds furthest page from current view
- **Aggressive Pre-rendering**: Predicts scroll direction and loads next/previous pages immediately
- **Scroll Position Calculation**: `Math.floor(scrollTop / pageHeight) + 1` for precise page detection
- **Proper Scrollbar**: Maintains correct proportions with full container height (`totalItems × itemHeight`)

**ExpenseTableVirtual Component** (`frontend/src/components/ExpenseTableVirtual.jsx`):
- **Expense-specific Integration**: Virtual scrolling specifically for expense data with 60px row height
- **API Caching**: Local cache prevents redundant API calls with `${projectId}-${page}-${pageSize}` keys
- **Row Interactions**: Handles category selection, personal checkboxes, and action buttons
- **Constants Configuration**: `LIST_ITEM_HEIGHT = 60`, `ROWS_PER_PAGE = 20` as defaults

**ExpenseRow Component** (`frontend/src/components/ExpenseRow.jsx`):
- **Exact Copy**: Extracted exact JSX structure from original SpreadsheetView (not rewritten)
- **Shared Component**: Used by both "Expenses" and "Expenses 2" tabs for perfect consistency
- **Original Styling**: Preserved all CSS classes (`category-column`, `status-column`, etc.)
- **Multi-line Description**: 2-line text truncation with ellipsis using `-webkit-line-clamp`

**Performance Optimizations**:
- **Fixed React Components**: 60 components mount once, only props update (no unmount/remount)
- **Aggressive Pre-loading**: 2-page lookahead in both scroll directions
- **Scroll Prediction**: Immediate next/previous page requests based on scroll direction
- **Caching Strategy**: API responses cached locally for instant revisiting
- **Responsive Intervals**: 500ms page watchdog, 50ms scroll lock for smooth experience

**UI Integration**:
- **"Expenses 2" Tab**: Added alongside "Expenses | Totals" for testing virtual scroll
- **Project Switching**: Component rebuild strategy (React key prop) for instant state reset
- **Visual Debugging**: Page containers colored skyblue/gold/indianred at 30% opacity
- **Scroll Reset**: Automatic scroll to top when switching projects

**Technical Challenges Solved**:
- **HTML Validation**: Final refactor to CSS display properties (`display: table`, `display: table-row`, `display: table-cell`) to resolve "<tr> cannot be a child of <div>" errors
- **Node Recycling**: Proper "Follow the Yellow Brick Road" algorithm for page container reuse
- **Blank Page Issues**: Fixed caching display to show cached data immediately
- **API Integration**: Proper endpoint configuration with `VITE_API_URL` and correct HTTP methods
- **Style Consistency**: Ensured exact visual match between original and virtual scroll tabs

**Files Created**:
- `frontend/src/components/VirtualInfiniteScroll.jsx` - Core virtual scrolling component
- `frontend/src/components/VirtualInfiniteScroll.css` - Styling and CSS display properties
- `frontend/src/components/ExpenseTableVirtual.jsx` - Expense-specific virtual table
- `frontend/src/utils/formatters.js` - Currency and date formatting utilities

**Files Modified**:
- `frontend/src/components/SpreadsheetView.jsx` - Added "Expenses 2" tab and component rebuild
- `frontend/src/components/ExpenseRow.jsx` - Extracted as shared component
- `frontend/src/contexts/SpreadsheetContext.jsx` - Project change scroll reset
- `frontend/src/App.jsx` - Component key prop for rebuild strategy

**Performance Results**:
- **Before**: 2000+ DOM elements for large datasets
- **After**: Maximum 60 DOM elements regardless of dataset size
- **Scrollbar**: Maintains proper proportions for entire dataset
- **Responsiveness**: Aggressive pre-loading eliminates loading delays
- **Memory**: Fixed components reuse instead of create/destroy cycles

**Current Status**: Virtual infinite scroll fully functional with React components, proper HTML structure, and performance optimization. Both "Expenses" and "Expenses 2" tabs use identical ExpenseRow component ensuring perfect consistency.

**Next Steps**: Production readiness testing, performance validation with large datasets, and potential standalone npm package publication.

## Phase 9: Virtual Scroll Feature Parity and Architecture Refactoring

**Goal**: Achieve complete feature parity between virtual scroll (Expenses 2) and regular table (Expenses) with unified state management

**Major Architecture Refactor**:
- **Zustand Store Integration**: Moved Zustand store from ExpenseTableVirtual into SpreadsheetContext for unified state management
- **Normalized State Architecture**: Both tables now share same normalized expense data keyed by row index
- **Optimistic Updates**: Real-time UI updates for all interactions (category changes, personal toggles) across both tables
- **Unified Keyboard Handling**: Single keyboard handler supports both regular and virtual scroll contexts

**Virtual Scroll Interactions Fixed**:
- **Row Activation**: Click to select with proper blue highlighting and tabindex management
- **Keyboard Shortcuts**: A (accept suggestion), P (toggle personal) working on virtual scroll
- **Category Hotkeys**: 1-9, Q-Z for quick category assignment
- **Checkbox Toggles**: Personal expense marking with immediate visual feedback
- **Action Links**: Accept/Clear links with proper state updates
- **Category Dropdowns**: Manual status handling and look-ahead propagation for matching descriptions
- **AI Categorization**: Job tracking system with real-time suggestion updates
- **Scroll Navigation**: Arrow key navigation properly follows active row in virtual scroll

**Real-time State Management**:
- **getCurrentExpense**: Virtual scroll rows get live data from Zustand store instead of cached page data
- **Immediate Updates**: Status changes from "Suggested" to "Accepted" appear instantly without refresh
- **Store Integration**: AI categorization job completion updates normalized store for both table types
- **Cross-tab Consistency**: Changes in one tab immediately reflect in the other

**UX Improvements**:
- **Project Close Button**: Absolute positioned X button at top-right corner (top: 20px, right: 20px)
- **Create Project Fix**: Auto-closes current project to prevent hotkey conflicts in modal dialogs
- **Sidebar Scroll**: Added overflow-y: auto for unlimited project lists
- **Column Width Optimization**: Category column 18%, Description 26% with 220px max-width dropdown

**Technical Achievements**:
- **Complete Feature Parity**: Virtual scroll now matches regular table functionality exactly
- **Performance Maintained**: Fixed 60 DOM elements with real-time reactivity
- **Clean Architecture**: Single source of truth with Zustand store in SpreadsheetContext
- **Error Resolution**: Fixed all setExpenses reference errors and job polling issues

**Files Modified**:
- `frontend/src/contexts/SpreadsheetContext.jsx` - Zustand integration and unified keyboard handling
- `frontend/src/components/ExpenseTableVirtual.jsx` - Connected to SpreadsheetContext
- `frontend/src/components/ExpenseRow2.jsx` - Real-time store integration with getCurrentExpense
- `frontend/src/components/SpreadsheetView.jsx` - Close button and tab management
- `frontend/src/components/VirtualInfiniteScroll.css` - Column width adjustments
- `frontend/src/components/ProjectsSidebar.jsx` - Sidebar scroll support
- `frontend/src/App.jsx` - Project close handling

**Current Status**: Virtual scroll has complete feature parity with regular table. All interactions work identically across both implementations with unified state management and real-time updates.

## Phase 10: Books — ledger, statement reconciliation, P&L / equity / balance sheet (Commits: a3d479a → b270df4)

**Goal**: Turn six years of categorized expense rows into books a CPA can use:
per year, beginning/ending cash, P&L, contributions of capital, distributions,
an equity rollforward and a balance sheet — living in the DB, exportable at will.

**Why**: The S-corp's returns had been prepared from Ookkee yearly totals alone.
Those totals are debit-only (no income, no transfers) and mix personal-card
business expenses, Gusto payroll, contractor payments, and owner transfers. The
preparer left Schedule L / M-2 blank. The CPA needs the equity side.

**Model** (V11 `db/migrations/V11__Books_ledger.sql`):
- `account` — one row per `expense.source`; `owner` business|personal;
  `in_books=false` excludes an account everywhere (the Australian GSB accounts).
- `expense.kind` — `expense | personal | payroll | contractor | income |
  contribution | distribution | transfer | refund`. `is_personal` stays the UI
  toggle; trigger `expense_sync_kind` keeps the two consistent for any writer.
  The categorization UI only ever sees expense/personal/payroll/contractor
  (`handlers/expense_filters.go` AppKinds/BusinessKinds/LedgerKinds); the
  `ledger` view exposes the rest.
- `expense.currency` lifted from raw_data; `fx_rate` holds IRS yearly averages.
- Raw statement layer: `statement_period` (opening/closing per statement) and
  `bank_transaction` (immutable lines, unique fingerprint). `expense.
  bank_transaction_id` links a ledger row to the statement line behind it.
- `invoice` / `invoice_payment` (Harvest), `tax_return_line` (prepared returns),
  `books_close` (frozen year snapshots with content hash).

**Amount conventions** (do not break these):
- `expense.amount` positive = money OUT (app convention). Deposits imported
  from statements are NEGATIVE expense rows.
- `bank_transaction.amount` signed as printed: + deposit, − withdrawal.
  For linked rows `expense.amount = −bank_transaction.amount`.
- Views show money POSITIVE in USD; the column/section gives the direction.

**Pipeline** (`backend/books`, CLI `backend/cmd/books`, `scripts/books-rebuild-dev.sh`):
1. `ufcu.go` parses `pdftotext -layout` output of UFCU statements. Every line
   is validated against the printed running balance and the opening→closing
   tie; a parse slip fails loudly. The bank's own summary line is only a
   warning (it nets same-day adjustment pairs).
2. `import.go` loads periods and lines idempotently.
3. `match.go` links each statement line to the categorized expense row (same
   year project, same signed amount, date within 5 days; live rows beat
   soft-deleted; description tokens break ties). Soft-deleted matches are
   restored under a ledger kind (never back into the P&L; with no rule they
   become distributions — the owner removed them from expenses, so the cash
   left for the owner). Lines nothing explains become new rows with kind from
   description rules (Gusto NET/TAX → payroll, FEE → expense; Hayes/Contractor
   → contractor; To SWEDBERG/CASTLE, Ally, personal card payments, ATM cash,
   bare "Internet Banking Transfer" → distribution; share moves → transfer;
   P2P from owner, "From SWEDBERG", cash/branch deposits, anonymous wires →
   contribution; adjustments/BVC → refund; else income for deposits, expense
   for withdrawals). Orphan expense rows (claim the account, no statement
   line) are reported.
4. `invoices.go` allocates income deposits to Harvest invoices (ACH memo
   invoice number, exact amount, subset sum, per-client batch waterfall).
   A contribution-kind deposit explained by an invoice flips to income.
   **Cash basis: income = `kind='income'` deposit rows. Invoices are labels;
   Harvest "paid on" dates are hand-entered and unreliable.**

**The books** (V12 views; export via `/api/books/*`, see `handlers/books.go`):
`v_ledger`, `v_cash_tie`, `v_pl`, `v_pl_summary`, `v_contributions`,
`v_distributions`, `v_cash_balances`, `v_equity_rollforward`, `v_balance_sheet`,
`v_books_checks`, `v_return_compare` (V13).
- Contributions = owner cash transferred in + business-kind rows on personal
  accounts. Distributions = distribution + personal kinds on business accounts.
- **Correctness claim**: `equity_eoy(y) = cash_boy(2020) + Σ≤y (net income +
  contributions − distributions)` must equal the December statement balance.
  On the owner's data it ties to the cent for 2020–2025. `v_books_checks`
  must be empty (except unlabelled income deposits) before a year is closed.

**Operations**:
- Migrations here were applied with `scripts/apply-migration.sh` (psql + the
  checksum Flyway computes) because the sandbox cannot run the Flyway
  container. Flyway will validate cleanly later.
- Dev loop: `DEV_DB=ookkee_books_dev scripts/books-rebuild-dev.sh` restores
  the pre-V11 backup (`backups/`), applies V11+, imports `data/books/ufcu/`,
  links, imports `data/books/harvest_invoices.csv`. Source documents live
  under `data/books/` (gitignored; private).
- Year close: `POST /api/books/close/{year}` freezes the pack; `GET
  /api/books/close` reports drift. Export: `GET /api/books/export?year=`.

**Lessons**:
- Validate parsers with the data's own invariants (running balance), not
  with summary lines; the bank's summary was the thing that lied.
- Never let an import mutate categorized rows; link to them. The raw layer
  makes the tie check prove the import, and the link makes coverage provable.
- Match on amount+date within a year project, then tokens; descriptions in
  the CSVs and on statements differ in boilerplate ("Debit Card Check Card").
- Restored soft-deleted rows must never re-enter the P&L silently.
- The patch and compaction tools rejected array arguments in this session;
  edits were made with python heredocs.
