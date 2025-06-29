import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useRef,
} from 'react';
import { useAiCategorizer } from '../hooks/useAiCategorizer';

const spreadsheetInitialValues = {
  // Data state
  expenses: [],
  categories: [],
  progress: { percentage: 0, isComplete: false },
  
  // Loading states
  loading: false,
  error: null,
  hasMore: true,
  page: 0,
  processingRows: new Set(),
  
  // UI state
  isTableActive: false,
  activeRowIndex: null,
  
  // Actions
  updateExpense: () => undefined,
  handleTogglePersonal: () => undefined,
  updateExpenseCategory: () => undefined,
  handleAcceptSuggestion: () => undefined,
  handleAiCategorization: () => undefined,
  handleClearCategory: () => undefined,
  fetchProgress: () => undefined,
  
  // Refs
  loadMoreRef: null,
  containerRef: null,
  tableRef: null,
};

export const SpreadsheetContext = createContext(spreadsheetInitialValues);

export const SpreadsheetContextProvider = ({ children, project }) => {
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [progress, setProgress] = useState({ percentage: 0, isComplete: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [processingRows, setProcessingRows] = useState(new Set());
  const [isTableActive, setIsTableActive] = useState(false);
  const [activeRowIndex, setActiveRowIndex] = useState(null);
  
  const loadMoreRef = useRef(null);
  const containerRef = useRef(null);
  const tableRef = useRef(null);
  const loadingRef = useRef(false);
  const LIMIT = 50;

  // AI Categorization hook
  const {
    isLoading: aiCategorizing,
    error: aiError,
    suggestions: aiSuggestions,
    categorizeExpenses,
    getSuggestionForRow,
    getAvailableModels
  } = useAiCategorizer(expenses, categories);

  // Fetch project progress
  const fetchProgress = useCallback(async () => {
    if (!project?.id) return;
    
    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";
      const response = await fetch(`${API_URL}/api/projects/${project.id}/progress`);
      if (response.ok) {
        const data = await response.json();
        setProgress({
          percentage: Math.round(data.percentage),
          isComplete: data.is_complete
        });
      }
    } catch (error) {
      console.error("Failed to fetch progress:", error);
    }
  }, [project?.id]);

  // Update expense function (handles both category and personal)
  const updateExpense = useCallback(async (expenseId, updates) => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";
      const response = await fetch(`${API_URL}/api/expenses/${expenseId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates)
      });

      if (!response.ok) {
        throw new Error(`Failed to update expense: ${response.status}`);
      }

      // Update local state immediately
      setExpenses(currentExpenses => 
        currentExpenses.map(expense => 
          expense.id === expenseId 
            ? { ...expense, ...updates }
            : expense
        )
      );

      // Refresh progress after categorization changes
      fetchProgress();

      console.log(`Updated expense ${expenseId}:`, updates);
    } catch (error) {
      console.error('Failed to update expense:', error);
    }
  }, [fetchProgress]);

  // Auto-advance to next row helper
  const advanceToNextRow = useCallback((expense) => {
    const currentIndex = expenses.findIndex(e => e.id === expense.id);
    if (currentIndex !== -1 && currentIndex === activeRowIndex && currentIndex < expenses.length - 1) {
      setActiveRowIndex(currentIndex + 1);
    }
  }, [expenses, activeRowIndex, setActiveRowIndex]);

  const handleTogglePersonal = useCallback((expense) => {
    updateExpense(expense.id, { is_personal: !expense.is_personal });
    advanceToNextRow(expense);
  }, [updateExpense, advanceToNextRow]);

  // Convenience functions for specific actions
  const updateExpenseCategory = useCallback((expenseId, categoryId) => {
    return updateExpense(expenseId, { accepted_category_id: categoryId || null });
  }, [updateExpense]);

  const handleAcceptSuggestion = useCallback((expense) => {
    if (expense.suggested_category_id && !expense.accepted_category_id) {
      updateExpenseCategory(expense.id, expense.suggested_category_id);
      advanceToNextRow(expense);
    }
  }, [updateExpenseCategory, advanceToNextRow]);

  const handleClearCategory = (expense) => {
    // Update local state immediately with null values for UI
    setExpenses(currentExpenses => 
      currentExpenses.map(exp => 
        exp.id === expense.id 
          ? { ...exp, accepted_category_id: null, suggested_category_id: null }
          : exp
      )
    );
    
    // Clear both accepted and suggested categories by setting to -1 (which backend will treat as null)
    updateExpense(expense.id, { 
      accepted_category_id: -1,
      suggested_category_id: -1 
    });
  };

  // AI Categorization function using the custom hook
  const handleAiCategorization = async () => {
    // Ensure we have data before proceeding
    if (!expenses.length || !categories.length) {
      console.warn('Cannot categorize: expenses or categories not loaded yet');
      return;
    }

    // Get next 20 uncategorized expenses that haven't been AI processed yet
    const uncategorizedExpenses = expenses.filter(expense => 
      !expense.accepted_category_id && 
      !expense.suggested_category_id &&
      !processingRows.has(expense.id)
    ).slice(0, 20);

    if (uncategorizedExpenses.length === 0) {
      console.log('No more uncategorized expenses to process');
      return;
    }

    // Mark these rows as being processed
    const processingIds = new Set(uncategorizedExpenses.map(e => e.id));
    setProcessingRows(prev => new Set([...prev, ...processingIds]));

    try {
      const suggestions = await categorizeExpenses(project.id, 'openai', uncategorizedExpenses);
      
      // Force a state update using the returned suggestions directly
      setExpenses(currentExpenses => {
        const updatedExpenses = currentExpenses.map(expense => {
          // Find suggestion for this expense in the returned suggestions
          const suggestion = suggestions.find(s => s.rowId === expense.id);
          if (suggestion) {
            return {
              ...expense,
              suggested_category_id: suggestion.categoryId,
              ai_confidence: suggestion.confidence,
              ai_reasoning: suggestion.reasoning
            };
          }
          return expense;
        });
        return [...updatedExpenses]; // Create new array to force re-render
      });
      
      console.log(`AI categorized ${suggestions.length} expenses`);
      
    } catch (error) {
      console.error(`AI categorization failed:`, error);
    } finally {
      // Remove from processing state
      setProcessingRows(prev => {
        const newSet = new Set(prev);
        processingIds.forEach(id => newSet.delete(id));
        return newSet;
      });
    }
  };

  // Load expenses function
  const loadExpenses = async (pageNum = 0, isInitial = false) => {
    // Prevent multiple simultaneous requests
    if (loadingRef.current) return;
    
    loadingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";
      const offset = pageNum * LIMIT;
      const response = await fetch(
        `${API_URL}/api/projects/${project.id}/expenses?offset=${offset}&limit=${LIMIT}`
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const newExpenses = await response.json();

      // If we got fewer than LIMIT results, we've reached the end
      if (newExpenses.length < LIMIT) {
        setHasMore(false);
      }

      setExpenses(prev => 
        isInitial ? newExpenses : [...prev, ...newExpenses]
      );
      
      // Always update page to reflect what we just loaded
      setPage(pageNum);
    } catch (err) {
      console.error("Failed to fetch expenses:", err);
      setError(`Failed to load expenses: ${err.message}`);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  };

  // Reset and load data when project changes
  useEffect(() => {
    if (!project?.id) return;
    
    const abortController = new AbortController();
    
    // Reset state
    setExpenses([]);
    setPage(0);
    setHasMore(true);
    setError(null);
    setProcessingRows(new Set());
    loadingRef.current = false;
    
    // Load initial data with abort signal
    const loadInitialData = async () => {
      try {
        const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";
        
        // Load expenses and categories in parallel
        const [expensesResponse, categoriesResponse] = await Promise.all([
          fetch(`${API_URL}/api/projects/${project.id}/expenses?offset=0&limit=${LIMIT}`, {
            signal: abortController.signal
          }),
          fetch(`${API_URL}/api/categories`, {
            signal: abortController.signal
          })
        ]);
        
        if (abortController.signal.aborted) return;
        
        // Handle expenses
        if (expensesResponse.ok) {
          const expensesData = await expensesResponse.json();
          if (expensesData.length < LIMIT) {
            setHasMore(false);
          }
          setExpenses(expensesData);
        }
        
        // Handle categories
        if (categoriesResponse.ok) {
          const categoriesData = await categoriesResponse.json();
          setCategories(categoriesData || []);
        }
        
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Failed to load initial data:', err);
          setError(`Failed to load data: ${err.message}`);
        }
      }
    };
    
    loadInitialData();
    
    // Cleanup function to abort requests if component unmounts or project changes
    return () => {
      abortController.abort();
    };
  }, [project?.id]);

  // Fetch progress when project changes or expenses are updated
  useEffect(() => {
    if (project?.id) {
      fetchProgress();
    }
  }, [fetchProgress, project?.id, expenses.length]);

  // Keyboard navigation handlers
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isTableActive) return;
      
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          setActiveRowIndex(prev => {
            if (prev === null || prev === 0) return expenses.length - 1;
            return prev - 1;
          });
          break;
        case 'ArrowDown':
          e.preventDefault();
          setActiveRowIndex(prev => {
            if (prev === null || prev >= expenses.length - 1) return 0;
            return prev + 1;
          });
          break;
        case 'Escape':
          setIsTableActive(false);
          setActiveRowIndex(null);
          break;
        case 'a':
        case 'A':
          if (activeRowIndex !== null) {
            e.preventDefault();
            handleAcceptSuggestion(expenses[activeRowIndex]);
          }
          break;
        case 'p':
        case 'P':
          if (activeRowIndex !== null) {
            e.preventDefault();
            handleTogglePersonal(expenses[activeRowIndex]);
          }
          break;

      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isTableActive, activeRowIndex, expenses, handleAcceptSuggestion, handleTogglePersonal]);

  const value = {
    // Data state
    expenses,
    categories,
    progress,
    
    // Loading states
    loading,
    error,
    hasMore,
    page,
    processingRows,
    aiCategorizing,
    
    // UI state
    isTableActive,
    activeRowIndex,
    setIsTableActive,
    setActiveRowIndex,
    
    // Actions
    updateExpense,
    handleTogglePersonal,
    updateExpenseCategory,
    handleAcceptSuggestion,
    handleAiCategorization,
    handleClearCategory,
    fetchProgress,
    loadExpenses,
    
    // Refs
    loadMoreRef,
    containerRef,
    tableRef,
    loadingRef,
    
    // Constants
    LIMIT,
  };

  return (
    <SpreadsheetContext.Provider value={value}>
      {children}
    </SpreadsheetContext.Provider>
  );
};


