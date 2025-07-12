import React, { useState, useCallback, useRef, useEffect, useContext } from 'react';
import VirtualInfiniteScroll from './VirtualInfiniteScroll';
import ExpenseRow2 from './ExpenseRow2';
import { formatCurrency, formatDate } from '../utils/formatters';
// Zustand store now accessed via SpreadsheetContext
import { SpreadsheetContext } from '../contexts/SpreadsheetContext';

// Constants for expense table configuration
const LIST_ITEM_HEIGHT = 60; // Height of each row in pixels
const ROWS_PER_PAGE = 20; // Number of rows per virtual page

const ExpenseTableVirtual = ({ projectId, totalExpenses = 0 }) => {
  const inflightRequests = useRef(new Set()); // Track API requests currently in flight
  
  // Get all context values from SpreadsheetContext (includes Zustand store functions)
  const {
    categories,
    processingRows,
    isTableActive,
    activeRowIndex,
    setIsTableActive,
    setActiveRowWithTabIndex,
    handleTogglePersonal,
    updateExpenseCategory,
    handleAcceptSuggestion,
    handleClearCategory,
    // Zustand store functions
    getExpensesForPage,
    hasCompletePageData,
    getExpenseByIndex,
    isPageRequested,
    setPageLoading,
    isPageLoading,
    markPageRequested,
    setStoreExpenses,
  } = useContext(SpreadsheetContext);
  
  // Reset inflight requests when project changes
  useEffect(() => {
    inflightRequests.current.clear();
  }, [projectId]);
  
  // Data fetching and keyboard handling now unified in SpreadsheetContext
  
  // Get current active expense for keyboard shortcuts
  const getCurrentActiveExpense = useCallback(() => {
    if (activeRowIndex !== null) {
      return getExpenseByIndex(activeRowIndex);
    }
    return null;
  }, [activeRowIndex, getExpenseByIndex]);

  // Reset inflight requests when project changes (project setting handled in SpreadsheetContext)
  useEffect(() => {
    inflightRequests.current.clear();
  }, [projectId]);

  // Categories fetching removed - now using SpreadsheetContext

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
          // Store expenses in Zustand store for virtual scroll
          setStoreExpenses(data, page, pageSize);
          return data;
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
    [projectId, hasCompletePageData, getExpensesForPage, isPageRequested, setPageLoading, markPageRequested, setStoreExpenses]
  );

  // Prepare props for ExpenseRow2 components using SpreadsheetContext
  const expenseRowProps = useCallback(() => {
    return {
      categories,
      processingRows,
      activeRowIndex,
      expenses: [], // Virtual scroll doesn't need full expenses array per row
      handleTogglePersonal,
      updateExpenseCategory,
      handleAcceptSuggestion,
      handleClearCategory,
      setIsTableActive,
      setActiveRowWithTabIndex,
    };
  }, [categories, processingRows, activeRowIndex, handleTogglePersonal, updateExpenseCategory, handleAcceptSuggestion, handleClearCategory, setIsTableActive, setActiveRowWithTabIndex]);

  // Row interactions now handled by SpreadsheetContext

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
