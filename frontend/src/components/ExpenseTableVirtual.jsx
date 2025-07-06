import React, { useState, useCallback, useRef } from 'react';
import VirtualInfiniteScroll from './VirtualInfiniteScroll';
import ExpenseRow2 from './ExpenseRow2';
import { formatCurrency, formatDate } from '../utils/formatters';

// Constants for expense table configuration
const LIST_ITEM_HEIGHT = 60; // Height of each row in pixels
const ROWS_PER_PAGE = 20;    // Number of rows per virtual page

const ExpenseTableVirtual = ({ projectId, totalExpenses = 0 }) => {
  const [categories, setCategories] = useState([]);
  const apiCache = useRef({});
  
  // Fetch categories on component mount
  React.useEffect(() => {
    fetchCategories();
  }, []);
  
  // Clear cache when project changes (component will be rebuilt anyway due to key prop)
  React.useEffect(() => {
    apiCache.current = {};
  }, [projectId]);
  
  const fetchCategories = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";
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
  const requestExpensePage = useCallback(async (page, pageSize) => {
    const cacheKey = `${projectId}-${page}-${pageSize}`;
    
    // Return cached data if available
    if (apiCache.current[cacheKey]) {
      return apiCache.current[cacheKey];
    }
    
    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";
      const offset = (page - 1) * pageSize;
      const response = await fetch(
        `${API_URL}/api/projects/${projectId}/expenses?limit=${pageSize}&offset=${offset}`
      );
      
      if (response.ok) {
        const data = await response.json();
        // Cache the data
        apiCache.current[cacheKey] = data;
        return data;
      } else {
        throw new Error('Failed to fetch expenses');
      }
    } catch (error) {
      console.error('Error fetching expenses:', error);
      return [];
    }
  }, [projectId]);
  
  // Prepare props for ExpenseRow2 components
  const expenseRowProps = useCallback(() => {
    return {
      categories,
      isActive: false, // Virtual scroll doesn't use active row highlighting
      processingRows: new Set(), // Could be passed in if needed
      activeRowIndex: null,
      expenses: [], // Not needed for individual row rendering
      handleTogglePersonal: (expense) => {
        window.togglePersonal?.(expense.id, !expense.is_personal);
      },
      updateExpenseCategory: (expenseId, categoryId) => {
        window.updateCategory?.(expenseId, categoryId);
      },
      handleAcceptSuggestion: (expense) => {
        window.acceptSuggestion?.(expense.id);
      },
      handleClearCategory: (expense) => {
        window.clearCategory?.(expense.id);
      },
      setIsTableActive: () => {}, // Not applicable in virtual scroll
      setActiveRowWithTabIndex: () => {}, // Not applicable in virtual scroll
    };
  }, [categories]);
  
  // Global functions for row interactions (attached to window)
  React.useEffect(() => {
    window.togglePersonal = async (expenseId, isPersonal) => {
      try {
        const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";
        const response = await fetch(`${API_URL}/api/expenses/${expenseId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ is_personal: isPersonal }),
        });
        
        if (!response.ok) {
          throw new Error('Failed to update expense');
        }
        
        // Clear cache to force refresh
        apiCache.current = {};
      } catch (error) {
        console.error('Error updating personal status:', error);
      }
    };
    
    window.updateCategory = async (expenseId, categoryId) => {
      try {
        const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";
        const response = await fetch(`${API_URL}/api/expenses/${expenseId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            accepted_category_id: categoryId ? parseInt(categoryId) : null 
          }),
        });
        
        if (!response.ok) {
          throw new Error('Failed to update category');
        }
        
        // Clear cache to force refresh
        apiCache.current = {};
      } catch (error) {
        console.error('Error updating category:', error);
      }
    };
    
    window.acceptSuggestion = async (expenseId) => {
      // Find the expense to get its suggested category
      // This is a simplified implementation - in a real app you'd track this better
      console.log('Accept suggestion for expense:', expenseId);
      // Would need to implement proper suggestion acceptance
    };
    
    window.clearCategory = async (expenseId) => {
      try {
        const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";
        const response = await fetch(`${API_URL}/api/expenses/${expenseId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            accepted_category_id: -1,
            suggested_category_id: -1
          }),
        });
        
        if (!response.ok) {
          throw new Error('Failed to clear category');
        }
        
        // Clear cache to force refresh
        apiCache.current = {};
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
  
  // Get fixed columns as specified: Source, Date, Description, Amount, Category, Action, Status
  const getColumns = () => {
    return ["Source", "Date", "Description", "Amount", "Category", "Action", "Status"];
  };
  
  const columns = getColumns();

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        No project selected
      </div>
    );
  }
  
  // Create header component
  const headerComponent = (
    <div className="virtual-table-row">
      <div className="virtual-table-cell w-12"></div>
      <div className="virtual-table-cell w-16 font-mono text-xs text-muted-foreground">#</div>
      {columns.map(column => (
        <div
          key={column}
          className={`virtual-table-cell font-semibold text-xs ${
            column === "Status" ? "text-right" : ""
          }`}
          style={{
            minWidth: column === "Category" ? "175px" : undefined
          }}
        >
          {column}
        </div>
      ))}
    </div>
  );

  return (
    <div className="spreadsheet overflow-auto relative h-[calc(100vh-250px)]">
      {/* Virtual Scrolling Table with Header */}
      <VirtualInfiniteScroll
        totalItems={totalExpenses}
        itemHeight={LIST_ITEM_HEIGHT}
        pageSize={ROWS_PER_PAGE}
        onRequestPage={requestExpensePage}
        ItemComponent={ExpenseRow2}
        itemProps={expenseRowProps()}
        containerHeight="calc(100vh - 200px)"
        headerComponent={headerComponent}
        loadingComponent={() => (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{
              width: '16px',
              height: '16px',
              border: '2px solid #e5e7eb',
              borderTop: '2px solid #3b82f6',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }}></div>
          </div>
        )}
      />
    </div>
  );
};

export default ExpenseTableVirtual;
