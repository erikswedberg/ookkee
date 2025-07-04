package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"ookkee/database"
	"ookkee/models"
	"os"
	"strings"

	"github.com/tmc/langchaingo/llms"
	"github.com/tmc/langchaingo/llms/anthropic"
	"github.com/tmc/langchaingo/llms/openai"
)

// ExpenseForAI represents an expense to be categorized by AI
type ExpenseForAI struct {
	ID          int     `json:"id"`
	Description string  `json:"description"`
	Amount      float64 `json:"amount"`
}

// CategorizeResponse represents the AI categorization result
type CategorizeResponse struct {
	RowID      int     `json:"rowId"`
	CategoryID int     `json:"categoryId"`
	Confidence float32 `json:"confidence"`
	Reasoning  string  `json:"reasoning,omitempty"`
}

// CategorizeFullResponse represents the complete response
type CategorizeFullResponse struct {
	SelectedExpenseIDs []int                `json:"selectedExpenseIds"`
	Categorizations    []CategorizeResponse `json:"categorizations"`
	Message            string               `json:"message,omitempty"`
}

// GetUncategorizedExpenses retrieves the next batch of uncategorized, non-personal expenses
func GetUncategorizedExpenses(ctx context.Context, projectID int, limit int) ([]ExpenseForAI, error) {
	query := `
		SELECT id, COALESCE(description, '') as description, COALESCE(amount, 0) as amount
		FROM expense 
		WHERE project_id = $1 
		  AND accepted_category_id IS NULL 
		  AND suggested_category_id IS NULL
		  AND (is_personal IS NULL OR is_personal = FALSE)
		  AND deleted_at IS NULL
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
		var expense ExpenseForAI
		err := rows.Scan(&expense.ID, &expense.Description, &expense.Amount)
		if err != nil {
			return nil, err
		}
		expenses = append(expenses, expense)
	}

	return expenses, rows.Err()
}

// GetAllCategories retrieves all available categories
func GetAllCategories(ctx context.Context) ([]models.ExpenseCategory, error) {
	query := `
		SELECT id, name, sort_order, created_at 
		FROM expense_category 
		WHERE deleted_at IS NULL 
		ORDER BY sort_order ASC
	`

	rows, err := database.Pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var categories []models.ExpenseCategory
	for rows.Next() {
		var cat models.ExpenseCategory
		err := rows.Scan(&cat.ID, &cat.Name, &cat.SortOrder, &cat.CreatedAt)
		if err != nil {
			return nil, err
		}
		categories = append(categories, cat)
	}

	return categories, rows.Err()
}

// ProcessCategorizationLogic contains the core AI categorization logic
func ProcessCategorizationLogic(ctx context.Context, projectID int, expensesToCategorize []ExpenseForAI, categoryDetails []models.ExpenseCategory, modelProvider string) (*CategorizeFullResponse, error) {
	// Step 1: Determine which AI model to use
	if modelProvider == "" {
		modelProvider = getEnv("AI_MODEL_PROVIDER", "openai") // Default to OpenAI
	}

	// Step 2: Initialize the appropriate LLM client
	llm, modelName, err := initializeLLM(modelProvider)
	if err != nil {
		log.Printf("Failed to initialize %s client: %v", modelProvider, err)
		// Fallback to mock responses if no AI service is available
		mockResponses := generateMockAIResponses(expensesToCategorize, categoryDetails)

		selectedIDs := make([]int, len(expensesToCategorize))
		for i, expense := range expensesToCategorize {
			selectedIDs[i] = expense.ID
		}

		return &CategorizeFullResponse{
			SelectedExpenseIDs: selectedIDs,
			Categorizations:    mockResponses,
			Message:            fmt.Sprintf("Mock categorization of %d expenses (no AI key configured)", len(mockResponses)),
		}, nil
	}

	// Step 3: Fetch accepted map for similar descriptions
	currentDescriptions := make([]string, len(expensesToCategorize))
	for i, expense := range expensesToCategorize {
		currentDescriptions[i] = expense.Description
	}

	acceptedMap, err := fetchAcceptedMap(ctx, projectID, currentDescriptions)
	if err != nil {
		log.Printf("Failed to fetch accepted map: %v", err)
		// Continue without accepted map
		acceptedMap = make(map[string]int)
	}
	log.Printf("Debug: accepted map size: %d, contents: %+v", len(acceptedMap), acceptedMap)

	// Step 4: Create categorization prompt with accepted map
	prompt := buildCategorizationPrompt(expensesToCategorize, categoryDetails, acceptedMap)
	log.Printf("Debug: AI prompt length: %d characters", len(prompt))
	log.Printf("Debug: AI prompt:\n%s", prompt)

	// Step 5: Call AI model
	aiResponse, err := llms.GenerateFromSinglePrompt(ctx, llm, prompt)
	if err != nil {
		return nil, fmt.Errorf("AI categorization failed: %v", err)
	}

	// Step 6: Parse AI response
	aiResponses, err := parseAIResponse(aiResponse, expensesToCategorize)
	if err != nil {
		return nil, fmt.Errorf("failed to parse AI response: %v", err)
	}

	// Step 7: Store categorization history AND update expense suggestions
	for _, aiResp := range aiResponses {
		// Store in history table
		err := storeCategorizationHistory(projectID, aiResp.RowID, aiResp.CategoryID, modelName, aiResp.Confidence, aiResp.Reasoning)
		if err != nil {
			log.Printf("Failed to store categorization history for expense %d: %v", aiResp.RowID, err)
			// Continue with other expenses even if one fails
		}

		// Update expense with suggested category
		err = updateExpenseSuggestion(ctx, aiResp.RowID, aiResp.CategoryID)
		if err != nil {
			log.Printf("Failed to update expense suggestion for expense %d: %v", aiResp.RowID, err)
			// Continue with other expenses even if one fails
		}
	}

	// Step 8: Prepare and return enhanced response with selected IDs
	selectedIDs := make([]int, len(expensesToCategorize))
	for i, expense := range expensesToCategorize {
		selectedIDs[i] = expense.ID
	}

	return &CategorizeFullResponse{
		SelectedExpenseIDs: selectedIDs,
		Categorizations:    aiResponses,
		Message:            fmt.Sprintf("Successfully categorized %d expenses", len(aiResponses)),
	}, nil
}

// Helper functions (copied from handlers)

func getEnv(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultValue
}

func initializeLLM(provider string) (llms.Model, string, error) {
	switch strings.ToLower(provider) {
	case "openai":
		openaiKey := os.Getenv("OPENAI_API_KEY")
		if openaiKey == "" {
			return nil, "", fmt.Errorf("OPENAI_API_KEY not set")
		}
		model := getEnv("OPENAI_MODEL", "gpt-4-turbo")
		llm, err := openai.New(
			openai.WithModel(model),
			openai.WithToken(openaiKey),
		)
		return llm, model, err

	case "anthropic":
		anthropicKey := os.Getenv("ANTHROPIC_API_KEY")
		if anthropicKey == "" {
			return nil, "", fmt.Errorf("ANTHROPIC_API_KEY not set")
		}
		model := getEnv("ANTHROPIC_MODEL", "claude-3-sonnet-20240229")
		llm, err := anthropic.New(
			anthropic.WithModel(model),
			anthropic.WithToken(anthropicKey),
		)
		return llm, model, err

	default:
		return nil, "", fmt.Errorf("unsupported AI provider: %s", provider)
	}
}

func fetchAcceptedMap(ctx context.Context, projectID int, currentDescriptions []string) (map[string]int, error) {
	if len(currentDescriptions) == 0 {
		return make(map[string]int), nil
	}

	// Fallback query without pg_trgm (just get all accepted descriptions)
	fallbackQuery := `
		SELECT DISTINCT lower(description) AS key,
		       accepted_category_id
		FROM   expense
		WHERE  project_id = $1
		  AND  accepted_category_id IS NOT NULL
		LIMIT  50
	`

	log.Printf("Debug: fetchAcceptedMap query - projectID: %d, descriptions: %+v", projectID, currentDescriptions)

	rows, err := database.Pool.Query(ctx, fallbackQuery, projectID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch accepted map: %v", err)
	}
	defer rows.Close()

	acceptedMap := make(map[string]int)
	rowCount := 0
	for rows.Next() {
		var key string
		var categoryID int
		if err := rows.Scan(&key, &categoryID); err != nil {
			return nil, err
		}
		acceptedMap[key] = categoryID
		rowCount++
	}

	log.Printf("Debug: fetchAcceptedMap found %d rows, map: %+v", rowCount, acceptedMap)
	return acceptedMap, rows.Err()
}

func buildCategorizationPrompt(expenses []ExpenseForAI, categories []models.ExpenseCategory, acceptedMap map[string]int) string {
	var prompt strings.Builder

	prompt.WriteString("You are an expert accountant helping categorize business expenses. ")
	prompt.WriteString("Analyze each expense description and amount, then choose the best category from the provided list.\n\n")

	prompt.WriteString("Available Categories:\n")
	for _, cat := range categories {
		prompt.WriteString(fmt.Sprintf("- ID: %d, Name: %s\n", cat.ID, cat.Name))
	}

	// Add accepted map for context if available
	if len(acceptedMap) > 0 {
		prompt.WriteString("\nSimilar Descriptions Previously Categorized:\n")
		for desc, categoryID := range acceptedMap {
			// Find category name by ID
			categoryName := "Unknown"
			for _, cat := range categories {
				if int(cat.ID) == categoryID {
					categoryName = cat.Name
					break
				}
			}
			prompt.WriteString(fmt.Sprintf("- '%s' → %s (ID: %d)\n", desc, categoryName, categoryID))
		}
		prompt.WriteString("\nUse these examples to help categorize similar descriptions.\n")
	}

	prompt.WriteString("\nExpenses to categorize:\n")
	for _, expense := range expenses {
		prompt.WriteString(fmt.Sprintf("- ID: %d, Description: '%s', Amount: $%.2f\n", expense.ID, expense.Description, expense.Amount))
	}

	prompt.WriteString("\nReturn your response as a JSON array with this exact format:\n")
	prompt.WriteString("[{\"rowId\": <expense_id>, \"categoryId\": <category_id>, \"confidence\": <0.0-1.0>, \"reasoning\": \"<brief explanation>\"}]\n\n")
	prompt.WriteString("Rules:\n")
	prompt.WriteString("1. Only use category IDs from the provided list\n")
	prompt.WriteString("2. Confidence should be 0.0-1.0 (1.0 = very confident, 0.5 = uncertain)\n")
	prompt.WriteString("3. Keep reasoning brief (1-2 sentences)\n")
	prompt.WriteString("4. If unsure, choose the closest match with lower confidence\n")
	prompt.WriteString("5. Return ONLY the JSON array, no other text\n")

	return prompt.String()
}

func parseAIResponse(response string, expenses []ExpenseForAI) ([]CategorizeResponse, error) {
	// Clean the response (remove markdown code blocks if present)
	response = strings.TrimSpace(response)
	response = strings.TrimPrefix(response, "```json")
	response = strings.TrimPrefix(response, "```")
	response = strings.TrimSuffix(response, "```")
	response = strings.TrimSpace(response)

	var aiResponses []CategorizeResponse
	err := json.Unmarshal([]byte(response), &aiResponses)
	if err != nil {
		return nil, fmt.Errorf("failed to parse AI JSON response: %v. Response was: %s", err, response)
	}

	// Validate responses
	for i, resp := range aiResponses {
		// Validate that expense ID exists in the request
		found := false
		for _, expense := range expenses {
			if expense.ID == resp.RowID {
				found = true
				break
			}
		}
		if !found {
			return nil, fmt.Errorf("AI returned invalid expense ID: %d", resp.RowID)
		}

		// Clamp confidence to valid range
		if resp.Confidence < 0 {
			aiResponses[i].Confidence = 0
		} else if resp.Confidence > 1 {
			aiResponses[i].Confidence = 1
		}
	}

	return aiResponses, nil
}

func storeCategorizationHistory(projectID, expenseID, categoryID int, model string, confidence float32, reasoning string) error {
	query := `
		INSERT INTO expense_history (expense_id, event_type, category_id, model_name, created_at)
		VALUES ($1, 'ai_suggest', $2, $3, NOW())
	`

	_, err := database.Pool.Exec(context.Background(), query, expenseID, categoryID, model)
	return err
}

func updateExpenseSuggestion(ctx context.Context, expenseID int, categoryID int) error {
	query := `
		UPDATE expense 
		SET suggested_category_id = $1, suggested_at = CURRENT_TIMESTAMP
		WHERE id = $2
	`

	_, err := database.Pool.Exec(ctx, query, categoryID, expenseID)
	return err
}

func generateMockAIResponses(expenses []ExpenseForAI, categories []models.ExpenseCategory) []CategorizeResponse {
	var responses []CategorizeResponse

	for _, expense := range expenses {
		// Simple mock logic: choose category based on keywords in description
		categoryID := 1 // Default to first category
		confidence := float32(0.7)
		reasoning := "Mock categorization based on description keywords"

		descLower := strings.ToLower(expense.Description)

		// Simple keyword matching for demo
		for _, cat := range categories {
			catLower := strings.ToLower(cat.Name)
			if strings.Contains(descLower, catLower) ||
				(strings.Contains(descLower, "gas") && strings.Contains(catLower, "gas")) ||
				(strings.Contains(descLower, "food") && strings.Contains(catLower, "meal")) ||
				(strings.Contains(descLower, "restaurant") && strings.Contains(catLower, "meal")) ||
				(strings.Contains(descLower, "parking") && strings.Contains(catLower, "parking")) ||
				(strings.Contains(descLower, "phone") && strings.Contains(catLower, "phone")) ||
				(strings.Contains(descLower, "internet") && strings.Contains(catLower, "internet")) {
				categoryID = int(cat.ID)
				confidence = 0.85
				reasoning = fmt.Sprintf("Matched keyword from description to %s category", cat.Name)
				break
			}
		}

		responses = append(responses, CategorizeResponse{
			RowID:      expense.ID,
			CategoryID: categoryID,
			Confidence: confidence,
			Reasoning:  reasoning,
		})
	}

	return responses
}
