import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useRef,
} from 'react';
import { toast } from 'sonner';
// Removed useAiCategorizer import - now using simplified backend-driven approach

const spreadsheetInitialValues = {
  // Data state
  expenses: [],
  categories: [],
  progress: { percentage: 0, isComplete: false, total_count: 0, categorized_count: 0 },
  
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
  const [progress, setProgress] = useState({ percentage: 0, isComplete: false, total_count: 0, categorized_count: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [processingRows, setProcessingRows] = useState(new Set());
  const [aiCategorizing, setAiCategorizing] = useState(false);
  const [isTableActive, setIsTableActive] = useState(false);
  const [activeRowIndex, setActiveRowIndex] = useState(null);
  const [previousActiveRowIndex, setPreviousActiveRowIndex] = useState(null);
  
  const loadMoreRef = useRef(null);
  const containerRef = useRef(null);
  const tableRef = useRef(null);
  const loadingRef = useRef(false);
  const LIMIT = 50;

  // AI Categorization state (now handled directly in context)
  // Removed useAiCategorizer hook dependency since backend now handles expense selection

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
          isComplete: data.is_complete,
          total_count: data.total_count || 0,
          categorized_count: data.categorized_count || 0
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

      // Get the actual values from API response
      const responseData = await response.json();
      
      // Update local state with API response values (not request values)
      setExpenses(currentExpenses => 
        currentExpenses.map(expense => {
          // Update the main expense
          if (expense.id === expenseId) {
            return {
              ...expense, 
              ...(responseData.accepted_category_id !== undefined && { accepted_category_id: responseData.accepted_category_id }),
              ...(responseData.suggested_category_id !== undefined && { suggested_category_id: responseData.suggested_category_id }),
              ...(responseData.is_personal !== undefined && { is_personal: responseData.is_personal })
            };
          }
          // Update propagated expenses if they exist
          else if (responseData.propagated_ids && responseData.propagated_ids.includes(expense.id)) {
            return {
              ...expense,
              accepted_category_id: responseData.accepted_category_id,
              accepted_at: new Date().toISOString() // Approximate timestamp
            };
          }
          return expense;
        })
      );
      
      // Show toast notification for auto-propagation
      if (responseData.propagated_count > 0 && responseData.accepted_category_id) {
        // Ensure type-safe comparison - convert both to numbers
        const categoryId = parseInt(responseData.accepted_category_id);
        
        // Debug logging
        console.log('Toast debug:', {
          categoryId,
          accepted_category_id: responseData.accepted_category_id,
          categories: categories.map(cat => ({ id: cat.id, name: cat.name, parsed_id: parseInt(cat.id) })),
          categoriesLength: categories.length
        });
        
        const category = categories.find(cat => {
          const catId = parseInt(cat.id);
          return catId === categoryId;
        });
        
        const categoryName = category?.name || `Category ID ${categoryId}`;
        
        toast.success(`${responseData.propagated_count} other item${responseData.propagated_count === 1 ? '' : 's'} with same description set to "${categoryName}"`);
      }

      // Refresh progress after categorization changes
      fetchProgress();

      console.log(`Updated expense ${expenseId}:`, updates);
    } catch (error) {
      console.error('Failed to update expense:', error);
    }
  }, [fetchProgress]);

  // Scroll active row into view helper
  const scrollActiveRowIntoView = useCallback((rowIndex) => {
    const row = document.querySelector(`[data-row-index="${rowIndex}"]`);
    if (row && containerRef.current) {
      const container = containerRef.current;
      const containerRect = container.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      
      // Only scroll if row goes below the bottom of the visible area
      if (rowRect.bottom > containerRect.bottom) {
        // Scroll so the row is at the top of the visible area
        const scrollTop = row.offsetTop - container.offsetTop;
        container.scrollTop = scrollTop;
      }
    }
  }, [containerRef]);

  // Set active row with proper tab index management
  const setActiveRowWithTabIndex = useCallback((newIndex) => {
    // Clear tabIndex from previous active row
    if (previousActiveRowIndex !== null) {
      const prevRow = document.querySelector(`[data-row-index="${previousActiveRowIndex}"]`);
      if (prevRow) {
        prevRow.setAttribute('tabindex', '1');
      }
    }
    
    // Set tabIndex on new active row
    if (newIndex !== null) {
      const newRow = document.querySelector(`[data-row-index="${newIndex}"]`);
      if (newRow) {
        newRow.setAttribute('tabindex', '0');
      }
    }
    
    setPreviousActiveRowIndex(activeRowIndex);
    setActiveRowIndex(newIndex);
  }, [activeRowIndex, previousActiveRowIndex]);

  // Auto-advance to next row helper
  const advanceToNextRow = useCallback((expense) => {
    const currentIndex = expenses.findIndex(e => e.id === expense.id);
    if (currentIndex !== -1 && currentIndex === activeRowIndex && currentIndex < expenses.length - 1) {
      const newIndex = currentIndex + 1;
      setActiveRowWithTabIndex(newIndex);
      scrollActiveRowIntoView(newIndex);
    }
  }, [expenses, activeRowIndex, setActiveRowWithTabIndex, scrollActiveRowIntoView]);

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
    // Send API call with -1 values (backend converts to NULL and returns null)
    updateExpense(expense.id, { 
      accepted_category_id: -1,
      suggested_category_id: -1 
    });
  };

  // AI Categorization function - now with job tracking
  const handleAiCategorization = async () => {
    if (!project?.id) {
      console.warn('Cannot categorize: no project selected');
      return;
    }

    // Set AI categorizing state
    setAiCategorizing(true);

    try {
      // Call the backend endpoint to start a job
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";
      const response = await fetch(`${API_URL}/api/projects/${project.id}/ai-categorize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'openai'  // Optional: specify AI model
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`AI categorization failed: ${response.status} - ${errorText}`);
      }

      const jobResult = await response.json();
      
      // Check if this is a job response or direct response (fallback)
      if (jobResult.job_id) {
        // Job-based response - handle job tracking
        console.log(`AI categorization job started: ${jobResult.job_id}`);
        
        // Set processing state for selected expenses
        const selectedExpenses = jobResult.selected_expenses || [];
        setProcessingRows(new Set(selectedExpenses));
        
        toast.info(`AI categorization started for ${selectedExpenses.length} expenses`);
        
        // Start polling for job completion
        pollJobStatus(jobResult.job_id);
      } else {
        // Direct response (fallback) - handle like before
        handleDirectAiResponse(jobResult);
      }
      
    } catch (error) {
      console.error('AI categorization failed:', error);
      toast.error(`AI categorization failed: ${error.message}`);
      setAiCategorizing(false);
    }
  };

  // Poll job status until completion
  const pollJobStatus = async (jobId) => {
    const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";
    let attempts = 0;
    const maxAttempts = 300; // Poll for up to 5 minutes (1s intervals)
    
    const poll = async () => {
      try {
        const response = await fetch(`${API_URL}/api/jobs/${jobId}`);
        
        if (!response.ok) {
          throw new Error(`Job status check failed: ${response.status}`);
        }
        
        const jobStatus = await response.json();
        console.log(`Job ${jobId} status: ${jobStatus.status}`);
        
        if (jobStatus.status === 'completed') {
          // Job completed successfully
          handleJobCompletion(jobStatus);
          return;
        } else if (jobStatus.status === 'failed') {
          // Job failed
          throw new Error(jobStatus.error || 'AI categorization job failed');
        } else if (jobStatus.status === 'processing' || jobStatus.status === 'queued') {
          // Job still in progress
          attempts++;
          if (attempts < maxAttempts) {
            setTimeout(poll, 1000); // Poll every 1 second
          } else {
            throw new Error('Job timeout: AI categorization took too long');
          }
        }
      } catch (error) {
        console.error('Job polling failed:', error);
        toast.error(`Job polling failed: ${error.message}`);
        setProcessingRows(new Set());
        setAiCategorizing(false);
      }
    };
    
    // Start polling
    poll();
  };

  // Handle job completion
  const handleJobCompletion = (jobStatus) => {
    const suggestions = jobStatus.categorizations || [];
    const selectedIds = jobStatus.selected_expenses || [];
    
    if (suggestions.length === 0) {
      console.log('No expenses were categorized (no uncategorized expenses found)');
      toast.info(jobStatus.message || 'No expenses needed categorization');
    } else {
      // Update expenses with AI suggestions
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
      toast.success(jobStatus.message || `AI categorized ${suggestions.length} expenses`);
      
      // Refresh progress after successful categorization
      fetchProgress();
    }
    
    // Clear processing state
    setProcessingRows(new Set());
    setAiCategorizing(false);
  };

  // Handle direct AI response (fallback for when job tracking is not available)
  const handleDirectAiResponse = (result) => {
    const suggestions = result.categorizations || [];
    const selectedIds = result.selectedExpenseIds || [];
    
    if (suggestions.length === 0) {
      console.log('No expenses were categorized (no uncategorized expenses found)');
      if (result.message) {
        console.log(`Backend message: ${result.message}`);
      }
      toast.info(result.message || 'No expenses needed categorization');
    } else {
      // Update expenses with AI suggestions
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
      if (result.message) {
        console.log(`Backend message: ${result.message}`);
      }
      toast.success(result.message || `AI categorized ${suggestions.length} expenses`);
      
      // Refresh progress after successful categorization
      fetchProgress();
    }
    
    setAiCategorizing(false);
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
          const upIndex = activeRowIndex === null || activeRowIndex === 0 ? expenses.length - 1 : activeRowIndex - 1;
          setActiveRowWithTabIndex(upIndex);
          break;
        case 'ArrowDown':
          e.preventDefault();
          const downIndex = activeRowIndex === null || activeRowIndex >= expenses.length - 1 ? 0 : activeRowIndex + 1;
          setActiveRowWithTabIndex(downIndex);
          setTimeout(() => scrollActiveRowIntoView(downIndex), 0);
          break;
        case 'Escape':
          setIsTableActive(false);
          setActiveRowWithTabIndex(null);
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
        default:
          // Check for category hotkeys
          if (activeRowIndex !== null && e.key.length === 1) {
            const hotkey = e.key.toUpperCase();
            const category = categories.find(cat => cat.hotkey === hotkey);
            if (category) {
              e.preventDefault();
              updateExpenseCategory(expenses[activeRowIndex].id, category.id);
            }
          }
          break;

      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isTableActive, activeRowIndex, expenses, handleAcceptSuggestion, handleTogglePersonal, scrollActiveRowIntoView, setActiveRowWithTabIndex]);

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
    setActiveRowWithTabIndex,
    
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


