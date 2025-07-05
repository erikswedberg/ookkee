import React, { useState, useCallback, useRef } from 'react';
import VirtualInfiniteScroll from './VirtualInfiniteScroll';
import { formatCurrency, formatDate } from '../utils/formatters';

const ExpenseTableVirtual = ({ projectId, totalExpenses = 0 }) => {
  const [categories, setCategories] = useState([]);
  const apiCache = useRef({});
  
  // Fetch categories on component mount
  React.useEffect(() => {
    fetchCategories();
  }, []);
  
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
  
  // Render a single expense row
  const renderExpenseRow = useCallback((expense, index) => {
    if (!expense) return '';
    
    const category = categories.find(c => c.id === expense.accepted_category_id);
    const categoryName = category ? category.name : '';
    
    // Create table row HTML
    const row = document.createElement('div');
    row.className = 'expense-row';
    row.style.cssText = `
      display: flex;
      align-items: center;
      height: 46px;
      border-bottom: 1px solid #e5e7eb;
      padding: 0 12px;
      background: ${expense.is_personal ? 'linear-gradient(135deg, rgba(156, 163, 175, 0.1) 0%, rgba(156, 163, 175, 0.05) 100%)' : 'white'};
    `;
    
    row.innerHTML = `
      <div class="expense-cell" style="width: 50px; min-width: 50px;">
        <input type="checkbox" ${expense.is_personal ? 'checked' : ''} 
               onchange="togglePersonal(${expense.id}, this.checked)"
               style="width: 16px; height: 16px; accent-color: #3b82f6;" />
      </div>
      <div class="expense-cell" style="width: 80px; min-width: 80px; font-size: 12px; color: #6b7280;">
        ${formatDate(expense.date_text)}
      </div>
      <div class="expense-cell" style="flex: 1; min-width: 200px; font-size: 13px; color: #374151;">
        ${expense.description || ''}
      </div>
      <div class="expense-cell" style="width: 100px; min-width: 100px; text-align: right; font-weight: 500; color: ${expense.amount >= 0 ? '#10b981' : '#ef4444'};">
        ${formatCurrency(expense.amount)}
      </div>
      <div class="expense-cell" style="width: 175px; min-width: 175px;">
        <select style="width: 100%; padding: 4px 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 12px; background: white;"
                onchange="updateCategory(${expense.id}, this.value)">
          <option value="">Select category...</option>
          ${categories.map(cat => 
            `<option value="${cat.id}" ${cat.id === expense.accepted_category_id ? 'selected' : ''}>
              ${cat.name}
            </option>`
          ).join('')}
        </select>
      </div>
    `;
    
    return row;
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
    
    // Cleanup
    return () => {
      delete window.togglePersonal;
      delete window.updateCategory;
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
        padding: '0 12px',
        fontSize: '12px',
        fontWeight: '600',
        color: '#374151',
        position: 'sticky',
        top: 0,
        zIndex: 10
      }}>
        <div style={{ width: '50px', minWidth: '50px' }}>Personal</div>
        <div style={{ width: '80px', minWidth: '80px' }}>Date</div>
        <div style={{ flex: 1, minWidth: '200px' }}>Description</div>
        <div style={{ width: '100px', minWidth: '100px', textAlign: 'right' }}>Amount</div>
        <div style={{ width: '175px', minWidth: '175px' }}>Category</div>
      </div>
      
      {/* Virtual Scrolling Table Body */}
      <VirtualInfiniteScroll
        totalItems={totalExpenses}
        itemHeight={46}
        pageSize={20}
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
