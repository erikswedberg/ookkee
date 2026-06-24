package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"ookkee/database"
	"ookkee/models"

	"github.com/tmc/langchaingo/llms"
)

// PersonalResponse is the AI's business/personal classification for one expense.
type PersonalResponse struct {
	RowID      int     `json:"rowId"`
	IsPersonal bool    `json:"isPersonal"`
	Confidence float32 `json:"confidence"`
	Reasoning  string  `json:"reasoning,omitempty"`
}

// SetPersonalFullResponse is the complete result of an AI "set personal" pass.
type SetPersonalFullResponse struct {
	SelectedExpenseIDs []int              `json:"selectedExpenseIds"`
	Classifications    []PersonalResponse `json:"classifications"`
	Message            string             `json:"message,omitempty"`
}

// GetUnsortedExpenses retrieves the next batch of expenses that have not yet had
// a business/personal decision made (neither confirmed personal nor an existing
// suggestion). These are the rows AI Set Personal should classify.
func GetUnsortedExpenses(ctx context.Context, projectID int, limit int) ([]ExpenseForAI, error) {
	query := `
		SELECT id, COALESCE(description, '') as description, COALESCE(amount, 0) as amount
		FROM expense
		WHERE project_id = $1
		  AND deleted_at IS NULL
		  AND (is_personal IS NULL OR is_personal = FALSE)
		  AND suggested_is_personal IS NULL
		ORDER BY row_index ASC
		LIMIT $2
	`
	rows, err := database.Pool.Query(ctx, query, projectID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var expenses []ExpenseForAI
	for rows.Next() {
		var e ExpenseForAI
		if err := rows.Scan(&e.ID, &e.Description, &e.Amount); err != nil {
			return nil, err
		}
		expenses = append(expenses, e)
	}
	return expenses, rows.Err()
}

// fetchPersonalExamples returns up to `limit` already-decided rows (confirmed
// business or personal) as few-shot examples: description -> isPersonal.
func fetchPersonalExamples(ctx context.Context, projectID int, limit int) ([]struct {
	Description string
	IsPersonal  bool
}, error) {
	query := `
		SELECT DISTINCT ON (lower(description)) description, is_personal
		FROM expense
		WHERE project_id = $1
		  AND deleted_at IS NULL
		  AND description IS NOT NULL AND description <> ''
		  AND is_personal IS NOT NULL
		ORDER BY lower(description), id
		LIMIT $2
	`
	rows, err := database.Pool.Query(ctx, query, projectID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []struct {
		Description string
		IsPersonal  bool
	}
	for rows.Next() {
		var d string
		var p bool
		if err := rows.Scan(&d, &p); err != nil {
			return nil, err
		}
		out = append(out, struct {
			Description string
			IsPersonal  bool
		}{d, p})
	}
	return out, rows.Err()
}

// ProcessSetPersonalLogic runs the AI business/personal classification, writing
// results to suggested_is_personal (staged, not auto-applied).
func ProcessSetPersonalLogic(ctx context.Context, projectID int, expenses []ExpenseForAI, categories []models.ExpenseCategory, modelProvider string) (*SetPersonalFullResponse, error) {
	if modelProvider == "" {
		modelProvider = getEnv("AI_MODEL_PROVIDER", "openai")
	}

	selectedIDs := make([]int, len(expenses))
	for i, e := range expenses {
		selectedIDs[i] = e.ID
	}

	llm, _, err := initializeLLM(modelProvider)
	if err != nil {
		// No AI configured: mock by leaning on category priors via keyword guess.
		log.Printf("Failed to initialize %s for set-personal: %v", modelProvider, err)
		mock := generateMockPersonalResponses(expenses)
		for _, m := range mock {
			_ = updatePersonalSuggestion(ctx, m.RowID, m.IsPersonal)
		}
		return &SetPersonalFullResponse{
			SelectedExpenseIDs: selectedIDs,
			Classifications:    mock,
			Message:            fmt.Sprintf("Mock business/personal classification of %d expenses (no AI key configured)", len(mock)),
		}, nil
	}

	examples, err := fetchPersonalExamples(ctx, projectID, 40)
	if err != nil {
		log.Printf("Failed to fetch personal examples: %v", err)
	}

	prompt := buildSetPersonalPrompt(expenses, categories, examples)
	aiResponse, err := llms.GenerateFromSinglePrompt(ctx, llm, prompt)
	if err != nil {
		return nil, fmt.Errorf("AI set-personal failed: %v", err)
	}

	responses, err := parsePersonalResponse(aiResponse, expenses)
	if err != nil {
		return nil, fmt.Errorf("failed to parse AI response: %v", err)
	}

	for _, resp := range responses {
		if err := updatePersonalSuggestion(ctx, resp.RowID, resp.IsPersonal); err != nil {
			log.Printf("Failed to update personal suggestion for expense %d: %v", resp.RowID, err)
		}
	}

	return &SetPersonalFullResponse{
		SelectedExpenseIDs: selectedIDs,
		Classifications:    responses,
		Message:            fmt.Sprintf("Classified %d expenses as business/personal", len(responses)),
	}, nil
}

func buildSetPersonalPrompt(expenses []ExpenseForAI, categories []models.ExpenseCategory, examples []struct {
	Description string
	IsPersonal  bool
}) string {
	var b strings.Builder
	b.WriteString("You are an expert accountant helping a sole proprietor separate BUSINESS expenses from PERSONAL ones. ")
	b.WriteString("For each expense, decide whether it is a business expense or a personal expense.\n\n")

	// Category leans as a prior (works even with no user history).
	var bizCats, perCats []string
	for _, c := range categories {
		if c.Lean == nil {
			continue
		}
		switch *c.Lean {
		case "business":
			bizCats = append(bizCats, c.Name)
		case "personal":
			perCats = append(perCats, c.Name)
		}
	}
	if len(bizCats) > 0 || len(perCats) > 0 {
		b.WriteString("General guidance on expense types:\n")
		if len(bizCats) > 0 {
			b.WriteString("- Usually BUSINESS: " + strings.Join(bizCats, ", ") + "\n")
		}
		if len(perCats) > 0 {
			b.WriteString("- Usually PERSONAL: " + strings.Join(perCats, ", ") + "\n")
		}
		b.WriteString("Expenses like gas, meals, and parking can be either.\n\n")
	}

	// Few-shot from the user's own decisions.
	if len(examples) > 0 {
		b.WriteString("Previously decided by this user (use as the strongest signal):\n")
		for _, ex := range examples {
			lane := "business"
			if ex.IsPersonal {
				lane = "personal"
			}
			b.WriteString(fmt.Sprintf("- '%s' -> %s\n", ex.Description, lane))
		}
		b.WriteString("\n")
	}

	b.WriteString("Expenses to classify:\n")
	for _, e := range expenses {
		b.WriteString(fmt.Sprintf("- ID: %d, Description: '%s', Amount: $%.2f\n", e.ID, e.Description, e.Amount))
	}

	b.WriteString("\nReturn ONLY a JSON array with this exact format:\n")
	b.WriteString("[{\"rowId\": <expense_id>, \"isPersonal\": <true|false>, \"confidence\": <0.0-1.0>, \"reasoning\": \"<brief>\"}]\n\n")
	b.WriteString("Rules:\n")
	b.WriteString("1. isPersonal=true means a personal (non-business) expense.\n")
	b.WriteString("2. Weight the user's previous decisions most heavily.\n")
	b.WriteString("3. Confidence 0.0-1.0; keep reasoning to 1 sentence.\n")
	b.WriteString("4. Return ONLY the JSON array, no other text.\n")
	return b.String()
}

func parsePersonalResponse(response string, expenses []ExpenseForAI) ([]PersonalResponse, error) {
	start := strings.Index(response, "[")
	end := strings.LastIndex(response, "]")
	if start == -1 || end == -1 || end < start {
		return nil, fmt.Errorf("no JSON array found in AI response")
	}
	jsonStr := response[start : end+1]

	var responses []PersonalResponse
	if err := json.Unmarshal([]byte(jsonStr), &responses); err != nil {
		return nil, fmt.Errorf("failed to unmarshal AI response: %v", err)
	}

	// Keep only responses for expenses we asked about.
	valid := make(map[int]bool, len(expenses))
	for _, e := range expenses {
		valid[e.ID] = true
	}
	filtered := responses[:0]
	for _, r := range responses {
		if valid[r.RowID] {
			filtered = append(filtered, r)
		}
	}
	return filtered, nil
}

func updatePersonalSuggestion(ctx context.Context, expenseID int, isPersonal bool) error {
	_, err := database.Pool.Exec(ctx, `
		UPDATE expense
		SET suggested_is_personal = $1, suggested_personal_at = CURRENT_TIMESTAMP
		WHERE id = $2
	`, isPersonal, expenseID)
	return err
}

// generateMockPersonalResponses is used when no AI key is configured.
func generateMockPersonalResponses(expenses []ExpenseForAI) []PersonalResponse {
	out := make([]PersonalResponse, 0, len(expenses))
	for _, e := range expenses {
		desc := strings.ToLower(e.Description)
		isPersonal := false
		for _, kw := range []string{"wholefds", "whole foods", "amazon", "netflix", "spotify", "apple.com", "rent", "kroger", "h-e-b", "heb"} {
			if strings.Contains(desc, kw) {
				isPersonal = true
				break
			}
		}
		out = append(out, PersonalResponse{
			RowID:      e.ID,
			IsPersonal: isPersonal,
			Confidence: 0.5,
			Reasoning:  "mock",
		})
	}
	return out
}
