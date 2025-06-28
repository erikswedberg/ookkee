import { useState } from 'react';

/**
 * Custom hook for AI categorization functionality
 * 
 * @param {Array} rows - Array of expense rows to categorize (max 20)
 * @param {Array} categories - Array of available categories
 * @param {Object} learnedMap - Map of learned categorizations (future feature)
 * @returns {Object} Hook state and functions
 */
export const useAiCategorizer = (rows = [], categories = [], learnedMap = {}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [lastModel, setLastModel] = useState(null);

  /**
   * Categorize expenses using AI
   * 
   * @param {string} projectId - Project ID
   * @param {string} model - AI model to use ('openai' or 'anthropic')
   * @param {Array} customRows - Optional custom rows (defaults to hook's rows)
   * @returns {Promise<Array>} Array of categorization suggestions
   */
  const categorizeExpenses = async (projectId, model = 'openai', customRows = null) => {
    setIsLoading(true);
    setError(null);
    setSuggestions([]);

    try {
      // Use provided rows or filter uncategorized from hook's rows
      const expensesToCategorize = customRows || rows
        .filter(row => !row.accepted_category_id)
        .slice(0, 20); // Limit to max 20 as specified

      if (expensesToCategorize.length === 0) {
        throw new Error('No uncategorized expenses found');
      }

      // Prepare expenses for AI processing
      const expensesForAI = expensesToCategorize.map(expense => ({
        id: expense.id,
        description: expense.description || expense.raw_data?.Description || '',
        amount: expense.amount || 0
      }));

      // Call the AI categorization endpoint
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';
      const response = await fetch(`${API_URL}/api/projects/${projectId}/ai-categorize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          expenses: expensesForAI,
          categories: categories.map(cat => cat.name), // Send only category names
          model: model
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`AI categorization failed: ${response.status} - ${errorText}`);
      }

      const aiSuggestions = await response.json();
      
      // Store suggestions and model used
      setSuggestions(aiSuggestions);
      setLastModel(model);
      
      console.log(`AI categorization completed using ${model}:`, aiSuggestions);
      
      return aiSuggestions;

    } catch (err) {
      console.error('AI categorization error:', err);
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Apply suggestions to expenses (updates the suggestions state)
   * 
   * @param {Array} newSuggestions - Array of new suggestions to apply
   */
  const applySuggestions = (newSuggestions) => {
    setSuggestions(prev => {
      const updated = [...prev];
      newSuggestions.forEach(newSugg => {
        const existingIndex = updated.findIndex(s => s.rowId === newSugg.rowId);
        if (existingIndex >= 0) {
          updated[existingIndex] = newSugg;
        } else {
          updated.push(newSugg);
        }
      });
      return updated;
    });
  };

  /**
   * Clear all suggestions
   */
  const clearSuggestions = () => {
    setSuggestions([]);
    setError(null);
  };

  /**
   * Get suggestion for a specific row ID
   * 
   * @param {number} rowId - Row ID to get suggestion for
   * @returns {Object|null} Suggestion object or null if not found
   */
  const getSuggestionForRow = (rowId) => {
    return suggestions.find(s => s.rowId === rowId) || null;
  };

  /**
   * Get available AI models
   * 
   * @returns {Array} Array of available model options
   */
  const getAvailableModels = () => {
    return [
      { value: 'openai', label: 'OpenAI GPT-4 Turbo', description: 'Best for general categorization' },
      { value: 'anthropic', label: 'Anthropic Claude-3 Sonnet', description: 'Good for detailed reasoning' }
    ];
  };

  return {
    // State
    isLoading,
    error,
    suggestions,
    lastModel,
    
    // Actions
    categorizeExpenses,
    applySuggestions,
    clearSuggestions,
    getSuggestionForRow,
    getAvailableModels,
    
    // Computed values
    hasError: !!error,
    hasSuggestions: suggestions.length > 0,
    suggestionsCount: suggestions.length
  };
};

export default useAiCategorizer;
