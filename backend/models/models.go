package models

import (
	"encoding/json"
	"time"
)

// TEST_USER_ID is a placeholder for user authentication
const TEST_USER_ID = "00000000-0000-0000-0000-000000000001"

type Project struct {
	ID           int64     `json:"id"`
	UserID       string    `json:"user_id"`
	Name         string    `json:"name"`
	OriginalName string    `json:"original_name"`
	CSVPath      string    `json:"csv_path"`
	RowCount     int       `json:"row_count"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type Expense struct {
	ID                  int64           `json:"id"`
	ProjectID           int64           `json:"project_id"`
	RowIndex            int             `json:"row_index"`
	RawData             json.RawMessage `json:"raw_data"`
	Source              *string         `json:"source"`
	DateText            *string         `json:"date_text"`
	Description         *string         `json:"description"`
	Amount              *float64        `json:"amount"`
	SuggestedCategoryID *int64          `json:"suggested_category_id"`
	AcceptedCategoryID  *int64          `json:"accepted_category_id"`
	IsPersonal          bool            `json:"is_personal"`
}

type Category struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	Hotkey    *string   `json:"hotkey"`
	SortOrder int       `json:"sort_order"`
	CreatedAt time.Time `json:"created_at"`
}

// ExpenseCategory is an alias for Category (for AI categorization compatibility)
type ExpenseCategory = Category

// ExpenseHistory tracks AI categorization attempts
type ExpenseHistory struct {
	ID                  int64     `json:"id"`
	ExpenseID           int64     `json:"expense_id"`
	SuggestedCategoryID *int64    `json:"suggested_category_id"`
	AIModel             *string   `json:"ai_model"`
	ConfidenceScore     *float32  `json:"confidence_score"`
	Reasoning           *string   `json:"reasoning"`
	CreatedAt           time.Time `json:"created_at"`
}
