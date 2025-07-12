import React, { useState, useCallback, useRef, useEffect } from 'react';
import VirtualInfiniteScroll from './VirtualInfiniteScroll';
import ExpenseRow2 from './ExpenseRow2';
import { formatCurrency, formatDate } from '../utils/formatters';
import useExpenseStore from '../stores/expenseStore';

// Constants for expense table configuration
const LIST_ITEM_HEIGHT = 60; // Height of each row in pixels
const ROWS_PER_PAGE = 20; // Number of rows per virtual page

const ExpenseTableVirtual = ({ projectId, totalExpenses = 0 }) => {
  const [categories, setCategories] = useState([]);
  const inflightRequests = useRef(new Set()); // Track API requests currently in flight
  
  // Zustand store hooks
  const {
    expenses,
    setProject,
    setExpenses,
    updateExpense,
    markPageRequested,
    isPageRequested,
    setPageLoading,
    isPageLoading,
    getExpensesForPage,
    hasCompletePageData,
    getDebugInfo,
  } = useExpenseStore();
  
  // Debug info (can be removed in production)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('Expense Store Debug:', getDebugInfo());
    }
  }, [expenses, getDebugInfo]);

  // Fetch categories on component mount
  React.useEffect(() => {
    fetchCategories();
  }, []);

  // Set project in store when project changes
  useEffect(() => {
    if (projectId) {
      setProject(projectId);
    }
    inflightRequests.current.clear();
  }, [projectId, setProject]);

  const fetchCategories = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';
      const response = await fetch(`${API_URL}/api/categories`);
      if (response.ok) {
        const data = await response.json();
        setCategories(data);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  // Request a page of expenses from the API
  const requestExpensePage = useCallback(
    async (page, pageSize) => {
      const requestKey = `${projectId}-${page}-${pageSize}`;
      
      // Check if we already have complete data for this page
      if (hasCompletePageData(page, pageSize)) {
        return getExpensesForPage(page, pageSize);
      }
      
      // Check if page is already requested
      if (isPageRequested(page)) {
        // Page was requested but may not be complete yet, return what we have
        return getExpensesForPage(page, pageSize);
      }
      
      // If request is already in flight, wait for it to complete
      if (inflightRequests.current.has(requestKey)) {
        // Wait for the inflight request to complete by polling the store
        return new Promise((resolve) => {
          const pollStore = () => {
            if (hasCompletePageData(page, pageSize)) {
              resolve(getExpensesForPage(page, pageSize));
            } else if (inflightRequests.current.has(requestKey)) {
              // Still in flight, check again in 50ms
              setTimeout(pollStore, 50);
            } else {
              // Request completed but no complete data (error case), return what we have
              resolve(getExpensesForPage(page, pageSize));
            }
          };
          setTimeout(pollStore, 50);
        });
      }
      
      // Mark request as in flight and page as loading
      inflightRequests.current.add(requestKey);
      setPageLoading(page, true);
      
      try {
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';
        const offset = (page - 1) * pageSize;
        const queryString = `expenses?limit=${pageSize}&offset=${offset}`;
        
        // Mark page as requested
        markPageRequested(page, queryString);
        
        const response = await fetch(
          `${API_URL}/api/projects/${projectId}/${queryString}`
        );
        
        if (response.ok) {
          const data = await response.json();
          // Store expenses in normalized state
          setExpenses(data, page, pageSize);
          return getExpensesForPage(page, pageSize);
        } else {
          throw new Error('Failed to fetch expenses');
        }
      } catch (error) {
        console.error('Error fetching expenses:', error);
        return getExpensesForPage(page, pageSize); // Return what we have, even if empty
      } finally {
        // Always remove from inflight requests and clear loading when done
        inflightRequests.current.delete(requestKey);
        setPageLoading(page, false);
      }
    },
    [projectId, hasCompletePageData, getExpensesForPage, isPageRequested, markPageRequested, setExpenses, setPageLoading]
  );

  // Prepare props for ExpenseRow2 components
  const expenseRowProps = useCallback(() => {
    return {
      categories,
      isActive: false, // Virtual scroll doesn't use active row highlighting
      processingRows: new Set(), // Could be passed in if needed
      activeRowIndex: null,
      expenses: [], // Not needed for individual row rendering
      handleTogglePersonal: expense => {
        // Optimistic update
        updateExpense(expense.id, { is_personal: !expense.is_personal });
        window.togglePersonal?.(expense.id, !expense.is_personal);
      },
      updateExpenseCategory: (expenseId, categoryId) => {
        // Optimistic update
        updateExpense(expenseId, { 
          accepted_category_id: categoryId ? parseInt(categoryId) : null 
        });
        window.updateCategory?.(expenseId, categoryId);
      },
      handleAcceptSuggestion: expense => {
        // Optimistic update - accept suggested category
        if (expense.suggested_category_id) {
          updateExpense(expense.id, { 
            accepted_category_id: expense.suggested_category_id 
          });
        }
        window.acceptSuggestion?.(expense.id);
      },
      handleClearCategory: expense => {
        // Optimistic update - clear both suggested and accepted
        updateExpense(expense.id, { 
          accepted_category_id: null,
          suggested_category_id: null 
        });
        window.clearCategory?.(expense.id);
      },
      setIsTableActive: () => {}, // Not applicable in virtual scroll
      setActiveRowWithTabIndex: () => {}, // Not applicable in virtual scroll
    };
  }, [categories, updateExpense]);

  // Global functions for row interactions (attached to window)
  React.useEffect(() => {
    window.togglePersonal = async (expenseId, isPersonal) => {
      try {
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';
        const response = await fetch(`${API_URL}/api/expenses/${expenseId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ is_personal: isPersonal }),
        });

        if (!response.ok) {
          throw new Error('Failed to update expense');
          // Revert optimistic update on error
          // Note: Could implement error rollback here if needed
        }
        
        // Update succeeded - optimistic update already applied
      } catch (error) {
        console.error('Error updating personal status:', error);
      }
    };

    window.updateCategory = async (expenseId, categoryId) => {
      try {
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';
        const response = await fetch(`${API_URL}/api/expenses/${expenseId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            accepted_category_id: categoryId ? parseInt(categoryId) : null,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to update category');
          // Revert optimistic update on error
          // Note: Could implement error rollback here if needed
        }
        
        // Update succeeded - optimistic update already applied
      } catch (error) {
        console.error('Error updating category:', error);
      }
    };

    window.acceptSuggestion = async expenseId => {
      // Find the expense to get its suggested category
      // This is a simplified implementation - in a real app you'd track this better
      console.log('Accept suggestion for expense:', expenseId);
      // Would need to implement proper suggestion acceptance
    };

    window.clearCategory = async expenseId => {
      try {
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';
        const response = await fetch(`${API_URL}/api/expenses/${expenseId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            accepted_category_id: -1,
            suggested_category_id: -1,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to clear category');
          // Revert optimistic update on error
          // Note: Could implement error rollback here if needed
        }
        
        // Update succeeded - optimistic update already applied
      } catch (error) {
        console.error('Error clearing category:', error);
      }
    };

    // Cleanup
    return () => {
      delete window.togglePersonal;
      delete window.updateCategory;
      delete window.acceptSuggestion;
      delete window.clearCategory;
    };
  }, [projectId]);

  // Fixed columns for expense table
  const columns = [
    'Source',
    'Date',
    'Description',
    'Amount',
    'Category',
    'Action',
    'Status',
  ];

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        No project selected
      </div>
    );
  }
  const headerComponent = (
    <div className="scroll-header border-b bg-background ">
      <div className="scroll-th px-3 py-2 text-xs font-medium text-center"></div>
      <div className="scroll-th scroll-th px-3 py-2 text-xs font-medium">#</div>
      {columns.map(column => (
        <div
          key={column}
          className={`scroll-th px-3 py-2 text-xs font-medium ${
            column === 'Status' ? 'text-right' : ''
          }`}
        >
          {column}
        </div>
      ))}
    </div>
  );

  return (
    <div className="spreadsheet relative h-[calc(100vh-162px)]">
      {/* Virtual Scrolling Table */}
      <div className="overflow-auto" style={{ height: 'calc(100% - 5px)' }}>
        <VirtualInfiniteScroll
          totalItems={totalExpenses}
          itemHeight={LIST_ITEM_HEIGHT}
          pageSize={ROWS_PER_PAGE}
          onRequestPage={requestExpensePage}
          ItemComponent={ExpenseRow2}
          itemProps={expenseRowProps()}
          containerHeight="100%"
          headerComponent={headerComponent}
          loadingComponent={() => (
            <div className="loading-spinner">
              <div className="spinner"></div>
            </div>
          )}
        />
      </div>
    </div>
  );
};

export default ExpenseTableVirtual;
