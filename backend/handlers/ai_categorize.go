package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"ookkee/database"
	"ookkee/models"
	"os"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/tmc/langchaingo/llms"
	"github.com/tmc/langchaingo/llms/anthropic"
	"github.com/tmc/langchaingo/llms/openai"
)

// AICategorizeRequest represents the request payload for AI categorization
type AICategorizeRequest struct {
	Expenses   []ExpenseForAI           `json:"expenses"`
	Categories []models.ExpenseCategory `json:"categories"`
	Model      string                   `json:"model,omitempty"` // "openai" or "anthropic"
}

// ExpenseForAI represents an expense to be categorized by AI
type ExpenseForAI struct {
	ID          int     `json:"id"`
	Description string  `json:"description"`
	Amount      float64 `json:"amount"`
}

// AICategorizeResponse represents the AI categorization result
type AICategorizeResponse struct {
	RowID      int     `json:"rowId"`
	CategoryID int     `json:"categoryId"`
	Confidence float32 `json:"confidence"`
	Reasoning  string  `json:"reasoning,omitempty"`
}

// AICategorizeExpenses handles AI-powered expense categorization
func AICategorizeExpenses(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// Get project ID from URL params
	projectIDStr := chi.URLParam(r, "projectID")
	projectID, err := strconv.Atoi(projectIDStr)
	if err != nil {
		http.Error(w, "Invalid project ID", http.StatusBadRequest)
		return
	}

	// Parse request body
	var req AICategorizeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf("Invalid request body: %v", err), http.StatusBadRequest)
		return
	}

	// Validate request
	if len(req.Expenses) == 0 {
		http.Error(w, "No expenses provided", http.StatusBadRequest)
		return
	}

	if len(req.Categories) == 0 {
		http.Error(w, "No categories provided", http.StatusBadRequest)
		return
	}

	// Limit to max 20 expenses
	if len(req.Expenses) > 20 {
		req.Expenses = req.Expenses[:20]
	}

	// Determine which AI model to use
	modelProvider := req.Model
	if modelProvider == "" {
		modelProvider = getEnv("AI_MODEL_PROVIDER", "openai") // Default to OpenAI
	}

	// Initialize the appropriate LLM client
	llm, modelName, err := initializeLLM(modelProvider)
	if err != nil {
		log.Printf("Failed to initialize %s client: %v", modelProvider, err)
		// Fallback to mock responses if no AI service is available
		mockResponses := generateMockAIResponses(req.Expenses, req.Categories)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(mockResponses)
		return
	}

	// Create categorization prompt
	prompt := buildCategorizationPrompt(req.Expenses, req.Categories)

	// Call AI model
	ctx := context.Background()
	response, err := llms.GenerateFromSinglePrompt(ctx, llm, prompt)
	if err != nil {
		log.Printf("AI categorization failed: %v", err)
		http.Error(w, "AI categorization failed", http.StatusInternalServerError)
		return
	}

	// Parse AI response
	aiResponses, err := parseAIResponse(response, req.Expenses)
	if err != nil {
		log.Printf("Failed to parse AI response: %v", err)
		http.Error(w, "Failed to process AI response", http.StatusInternalServerError)
		return
	}

	// Store categorization history in database
	for _, aiResp := range aiResponses {
		err := storeCategorizationHistory(projectID, aiResp.RowID, aiResp.CategoryID, modelName, aiResp.Confidence, aiResp.Reasoning)
		if err != nil {
			log.Printf("Failed to store categorization history for expense %d: %v", aiResp.RowID, err)
			// Continue with other expenses even if one fails
		}
	}

	// Return AI categorization results
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(aiResponses)
}

// buildCategorizationPrompt creates the prompt for AI categorization
func buildCategorizationPrompt(expenses []ExpenseForAI, categories []models.ExpenseCategory) string {
	var prompt strings.Builder

	prompt.WriteString("You are an expert accountant helping categorize business expenses. ")
	prompt.WriteString("Analyze each expense description and amount, then choose the best category from the provided list.\n\n")

	prompt.WriteString("Available Categories:\n")
	for _, cat := range categories {
		prompt.WriteString(fmt.Sprintf("- ID: %d, Name: %s\n", cat.ID, cat.Name))
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

// parseAIResponse parses the AI model's JSON response
func parseAIResponse(response string, expenses []ExpenseForAI) ([]AICategorizeResponse, error) {
	// Clean the response (remove markdown code blocks if present)
	response = strings.TrimSpace(response)
	response = strings.TrimPrefix(response, "```json")
	response = strings.TrimPrefix(response, "```")
	response = strings.TrimSuffix(response, "```")
	response = strings.TrimSpace(response)

	var aiResponses []AICategorizeResponse
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

// storeCategorizationHistory stores AI categorization in expense_history table
func storeCategorizationHistory(projectID, expenseID, categoryID int, model string, confidence float32, reasoning string) error {
	query := `
		INSERT INTO expense_history (expense_id, suggested_category_id, ai_model, confidence_score, reasoning, created_at)
		VALUES ($1, $2, $3, $4, $5, NOW())
	`

	_, err := database.Pool.Exec(context.Background(), query, expenseID, categoryID, model, confidence, reasoning)
	return err
}

// generateMockAIResponses creates mock responses when no API key is available
func generateMockAIResponses(expenses []ExpenseForAI, categories []models.ExpenseCategory) []AICategorizeResponse {
	var responses []AICategorizeResponse

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

		responses = append(responses, AICategorizeResponse{
			RowID:      expense.ID,
			CategoryID: categoryID,
			Confidence: confidence,
			Reasoning:  reasoning,
		})
	}

	return responses
}

// initializeLLM initializes the appropriate LLM client based on the provider
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
		anthropic_key := os.Getenv("ANTHROPIC_API_KEY")
		if anthropic_key == "" {
			return nil, "", fmt.Errorf("ANTHROPIC_API_KEY not set")
		}
		model := getEnv("ANTHROPIC_MODEL", "claude-3-sonnet-20240229")
		llm, err := anthropic.New(
			anthropic.WithModel(model),
			anthropic.WithToken(anthropic_key),
		)
		return llm, model, err

	default:
		return nil, "", fmt.Errorf("unsupported AI provider: %s", provider)
	}
}
