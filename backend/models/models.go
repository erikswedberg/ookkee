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
	Description         *string         `json:"description"`
	Amount              *float64        `json:"amount"`
	SuggestedCategoryID *int64          `json:"suggested_category_id"`
	AcceptedCategoryID  *int64          `json:"accepted_category_id"`
}

type Category struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	SortOrder int       `json:"sort_order"`
	CreatedAt time.Time `json:"created_at"`
}
