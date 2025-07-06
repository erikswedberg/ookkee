import React, { useState, useCallback, useRef } from 'react';
import VirtualInfiniteScroll from './VirtualInfiniteScroll';
import ExpenseRow from './ExpenseRow';
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
  
  // Render a single expense row using shared component
  const renderExpenseRow = useCallback((expense, index) => {
    if (!expense) return null;
    
    // Create a wrapper div that will contain the React component
    const wrapper = document.createElement('div');
    wrapper.style.height = `${LIST_ITEM_HEIGHT}px`; // Ensure consistent height
    
    // We need to use ReactDOM.render for this to work, but that's complex
    // Instead, let's return the raw HTML that matches ExpenseRow structure
    // This is a temporary solution until we refactor the virtual scroll to work with React components
    
    const formatAmount = (amount) => {
      if (amount === null || amount === undefined) return "";
      return formatCurrency(amount);
    };
    
    const getAmountClass = (amount) => {
      if (amount === null || amount === undefined) return "";
      return amount >= 0 ? "text-green-600" : "text-red-600";
    };
    
    const getStatusValue = (expense) => {
      if (expense.is_personal) return "Personal";
      if (expense.accepted_category_id) {
        if (!expense.suggested_category_id) return "Manual";
        if (expense.accepted_category_id !== expense.suggested_category_id) return "Manual";
        return "Accepted";
      } else if (expense.suggested_category_id) {
        return "Suggested";
      } else {
        return "Uncategorized";
      }
    };
    
    wrapper.innerHTML = `
      <div class="flex items-center border-b border-gray-200 hover:bg-sky-50 ${expense.is_personal ? 'personal' : ''}" 
           style="height: ${LIST_ITEM_HEIGHT}px; position: relative;">
        
        <!-- Personal Checkbox -->
        <div class="w-12 px-3">
          <input type="checkbox" ${expense.is_personal ? 'checked' : ''}
                 onchange="togglePersonal(${expense.id}, this.checked)"
                 class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500" />
        </div>
        
        <!-- Row Index -->
        <div class="w-16 px-3 font-mono text-xs text-gray-500">
          ${(expense.row_index || 0) + 1}
        </div>
        
        <!-- Source -->
        <div class="px-3" style="min-width: 80px;">
          <span class="text-sm">${expense.source || ''}</span>
        </div>
        
        <!-- Date -->
        <div class="px-3" style="min-width: 80px;">
          <span class="text-sm text-gray-600">${formatDate(expense.date_text)}</span>
        </div>
        
        <!-- Description -->
        <div class="flex-1 px-3" style="min-width: 200px;">
          <div class="text-sm" style="
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            text-overflow: ellipsis;
            line-height: 1.3;
            max-height: 2.6em;
          ">${expense.description || ''}</div>
        </div>
        
        <!-- Amount -->
        <div class="px-3 text-right font-mono" style="min-width: 100px;">
          <span class="font-medium ${getAmountClass(expense.amount)}">
            ${formatAmount(expense.amount)}
          </span>
        </div>
        
        <!-- Category -->
        <div class="px-3" style="min-width: 175px;">
          <select onchange="updateCategory(${expense.id}, this.value)"
                  class="w-full p-1 text-xs border border-gray-300 rounded focus:border-blue-600 focus:ring-2 focus:ring-blue-200">
            <option value="">Select category...</option>
            ${categories.map(cat => 
              `<option value="${cat.id}" ${cat.id === expense.accepted_category_id ? 'selected' : ''}>
                ${cat.name}${cat.id === expense.suggested_category_id ? ' 💡' : ''}
              </option>`
            ).join('')}
          </select>
        </div>
        
        <!-- Action -->
        <div class="px-3" style="min-width: 80px;">
          <div class="opacity-0 group-hover:opacity-100">
            <button onclick="acceptSuggestion(${expense.id})" 
                    class="text-blue-600 hover:text-blue-800 text-xs mr-2"
                    ${!expense.suggested_category_id || expense.accepted_category_id ? 'disabled' : ''}>
              Accept
            </button>
            <button onclick="clearCategory(${expense.id})"
                    class="text-red-600 hover:text-red-800 text-xs"
                    ${!expense.accepted_category_id && !expense.suggested_category_id ? 'style="visibility: hidden;"' : ''}>
              Clear
            </button>
          </div>
        </div>
        
        <!-- Status -->
        <div class="px-3 text-right" style="min-width: 100px;">
          <span class="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full 
                       ${getStatusValue(expense).toLowerCase() === 'personal' ? 'bg-purple-100 text-purple-800' :
                         getStatusValue(expense).toLowerCase() === 'accepted' ? 'bg-green-100 text-green-800' :
                         getStatusValue(expense).toLowerCase() === 'suggested' ? 'bg-blue-100 text-blue-800' :
                         getStatusValue(expense).toLowerCase() === 'manual' ? 'bg-yellow-100 text-yellow-800' :
                         'bg-gray-100 text-gray-800'}">
            ${getStatusValue(expense)}
          </span>
        </div>
        
        ${expense.is_personal ? `
          <div class="absolute inset-0 pointer-events-none z-10"
               style="background: radial-gradient(at center, rgba(255,255,255,0.8), rgba(255,255,255,0.2)); margin-left: 48px;"></div>
        ` : ''}
      </div>
    `;
    
    return wrapper;
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
  
  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        No project selected
      </div>
    );
  }
  
  return (
    <div className="expense-table-virtual">
      {/* Table Header */}
      <div className="expense-header" style={{
        display: 'flex',
        alignItems: 'center',
        height: '40px',
        backgroundColor: '#f9fafb',
        borderBottom: '2px solid #e5e7eb',
        padding: '0',
        fontSize: '12px',
        fontWeight: '600',
        color: '#374151',
        position: 'sticky',
        top: 0,
        zIndex: 10
      }}>
        <div className="px-3" style={{ width: '48px', minWidth: '48px' }}></div>
        <div className="px-3" style={{ width: '64px', minWidth: '64px' }}>#</div>
        <div className="px-3" style={{ minWidth: '80px' }}>Source</div>
        <div className="px-3" style={{ minWidth: '80px' }}>Date</div>
        <div className="px-3" style={{ flex: 1, minWidth: '200px' }}>Description</div>
        <div className="px-3" style={{ width: '100px', minWidth: '100px', textAlign: 'right' }}>Amount</div>
        <div className="px-3" style={{ width: '175px', minWidth: '175px' }}>Category</div>
        <div className="px-3" style={{ minWidth: '80px' }}>Action</div>
        <div className="px-3" style={{ width: '100px', minWidth: '100px', textAlign: 'right' }}>Status</div>
      </div>
      
      {/* Virtual Scrolling Table Body */}
      <VirtualInfiniteScroll
        totalItems={totalExpenses}
        itemHeight={LIST_ITEM_HEIGHT}
        pageSize={ROWS_PER_PAGE}
        onRequestPage={requestExpensePage}
        renderItem={renderExpenseRow}
        containerHeight="calc(100vh - 200px)"
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
