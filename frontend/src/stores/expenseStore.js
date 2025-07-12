import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

// Expense store with normalized state
const useExpenseStore = create(
  devtools(
    (set, get) => ({
      // Normalized state: expense row_index -> expense data
      expenses: {},
      
      // Page request tracking: page number -> query string
      requestedPages: {},
      
      // Loading states
      loadingPages: new Set(),
      
      // Current project ID for cache invalidation
      currentProjectId: null,
      
      // Actions
      
      // Set project and clear state when project changes
      setProject: (projectId) => {
        if (get().currentProjectId !== projectId) {
          set({
            currentProjectId: projectId,
            expenses: {},
            requestedPages: {},
            loadingPages: new Set(),
          });
        }
      },
      
      // Store expenses from API response (array of 20 expenses)
      setExpenses: (expenseArray, page, pageSize) => {
        const state = get();
        const newExpenses = { ...state.expenses };
        
        // Store each expense by its row_index
        expenseArray.forEach((expense, arrayIndex) => {
          const rowIndex = (page - 1) * pageSize + arrayIndex;
          newExpenses[rowIndex] = {
            ...expense,
            _rowIndex: rowIndex, // Store calculated row index
          };
        });
        
        set({
          expenses: newExpenses,
        });
      },
      
      // Update a single expense optimistically
      updateExpense: (expenseId, updates) => {
        const state = get();
        const newExpenses = { ...state.expenses };
        
        // Find expense by ID and update
        Object.keys(newExpenses).forEach(rowIndex => {
          if (newExpenses[rowIndex].id === expenseId) {
            newExpenses[rowIndex] = {
              ...newExpenses[rowIndex],
              ...updates,
            };
          }
        });
        
        set({ expenses: newExpenses });
      },
      
      // Mark a page as requested
      markPageRequested: (page, query) => {
        const state = get();
        set({
          requestedPages: {
            ...state.requestedPages,
            [page]: query,
          },
        });
      },
      
      // Check if page has been requested
      isPageRequested: (page) => {
        return !!get().requestedPages[page];
      },
      
      // Add page to loading set
      setPageLoading: (page, isLoading) => {
        const state = get();
        const newLoadingPages = new Set(state.loadingPages);
        
        if (isLoading) {
          newLoadingPages.add(page);
        } else {
          newLoadingPages.delete(page);
        }
        
        set({ loadingPages: newLoadingPages });
      },
      
      // Check if page is loading
      isPageLoading: (page) => {
        return get().loadingPages.has(page);
      },
      
      // Get expenses for a specific page (returns array of 20 items)
      getExpensesForPage: (page, pageSize = 20) => {
        const state = get();
        const startIndex = (page - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        const result = [];
        
        for (let i = startIndex; i < endIndex; i++) {
          result.push(state.expenses[i] || null);
        }
        
        return result;
      },
      
      // Get a single expense by row index
      getExpenseByIndex: (rowIndex) => {
        return get().expenses[rowIndex] || null;
      },
      
      // Check if we have all expenses for a page
      hasCompletePageData: (page, pageSize = 20) => {
        const state = get();
        const startIndex = (page - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        
        for (let i = startIndex; i < endIndex; i++) {
          if (!state.expenses[i]) {
            return false;
          }
        }
        
        return true;
      },
      
      // Clear all data (for project changes or refresh)
      clearAll: () => {
        set({
          expenses: {},
          requestedPages: {},
          loadingPages: new Set(),
        });
      },
      
      // Get debug info
      getDebugInfo: () => {
        const state = get();
        return {
          expenseCount: Object.keys(state.expenses).length,
          requestedPages: Object.keys(state.requestedPages),
          loadingPages: Array.from(state.loadingPages),
        };
      },
    }),
    {
      name: 'expense-store', // DevTools name
    }
  )
);

export default useExpenseStore;
