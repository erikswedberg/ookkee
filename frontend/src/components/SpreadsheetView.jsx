import { useState, useEffect, useRef } from "react";
import {
  TableCell,
  TableHead,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { RefreshCw } from "lucide-react";
import { useAiCategorizer } from "../hooks/useAiCategorizer";

const SpreadsheetView = ({ project }) => {
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [totals, setTotals] = useState([]);
  const [progress, setProgress] = useState({ percentage: 0, isComplete: false });
  const [loading, setLoading] = useState(false);
  const [loadingTotals, setLoadingTotals] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [processingRows, setProcessingRows] = useState(new Set()); // Track rows being AI processed
  const [isTableActive, setIsTableActive] = useState(false);
  const [activeRowIndex, setActiveRowIndex] = useState(null);
  const [activeTab, setActiveTab] = useState("expenses");
  const loadMoreRef = useRef(null);
  const containerRef = useRef(null);
  const tableRef = useRef(null);
  const loadingRef = useRef(false); // Prevent race conditions
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
  }, [isTableActive, activeRowIndex, expenses]);

  // Click outside handler (only active on expenses tab)
  useEffect(() => {
    if (activeTab !== "expenses") {
      // Clear active state when switching away from expenses tab
      setIsTableActive(false);
      setActiveRowIndex(null);
      return;
    }
    
    const handleClickOutside = (e) => {
      if (tableRef.current && !tableRef.current.contains(e.target)) {
        setIsTableActive(false);
        setActiveRowIndex(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activeTab]);

  // Fetch totals when switching to totals tab
  useEffect(() => {
    if (activeTab === "totals") {
      fetchTotals();
    }
  }, [activeTab, project?.id]);

  // Fetch progress when project changes or expenses are updated
  useEffect(() => {
    if (project?.id) {
      fetchProgress();
    }
  }, [project?.id]);

  // Refresh progress when expenses change (after categorization)
  useEffect(() => {
    if (project?.id && expenses.length > 0) {
      fetchProgress();
    }
  }, [project?.id, expenses.length]);

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
  }, [project?.id]); // Only depend on project.id to avoid duplicate calls

  // Fetch categories (used for refreshing categories after updates)
  const fetchCategories = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";
      const response = await fetch(`${API_URL}/api/categories`);
      if (response.ok) {
        const data = await response.json();
        setCategories(data || []);
      }
    } catch (error) {
      console.error("Failed to fetch categories:", error);
    }
  };

  // Fetch project totals
  const fetchTotals = async () => {
    if (!project?.id) return;
    
    setLoadingTotals(true);
    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";
      const response = await fetch(`${API_URL}/api/projects/${project.id}/totals`);
      if (response.ok) {
        const data = await response.json();
        setTotals(data || []);
      }
    } catch (error) {
      console.error("Failed to fetch totals:", error);
    } finally {
      setLoadingTotals(false);
    }
  };

  // Fetch project progress
  const fetchProgress = async () => {
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
  };

  // Update expense function (handles both category and personal)
  const updateExpense = async (expenseId, updates) => {
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
  };

  // Convenience functions for specific actions
  const updateExpenseCategory = (expenseId, categoryId) => {
    return updateExpense(expenseId, { accepted_category_id: categoryId || null });
  };

  const handleAcceptSuggestion = (expense) => {
    if (expense.suggested_category_id && !expense.accepted_category_id) {
      updateExpenseCategory(expense.id, expense.suggested_category_id);
    }
  };

  const handleTogglePersonal = (expense) => {
    updateExpense(expense.id, { is_personal: !expense.is_personal });
  };

  const handleClearCategory = (expense) => {
    // Clear both accepted and suggested categories by setting to -1 (which backend will treat as null)
    // But update local state to null for proper UI display
    updateExpense(expense.id, { 
      accepted_category_id: -1,
      suggested_category_id: -1 
    });
    
    // Update local state immediately with null values for UI
    setExpenses(currentExpenses => 
      currentExpenses.map(exp => 
        exp.id === expense.id 
          ? { ...exp, accepted_category_id: null, suggested_category_id: null }
          : exp
      )
    );
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

  // Intersection Observer for infinite scroll
  useEffect(() => {
    // Only set up observer on expenses tab
    if (activeTab !== "expenses") {
      return;
    }
    
    const currentLoadMoreRef = loadMoreRef.current;
    const currentContainerRef = containerRef.current;
    
    // Wait for expenses to be loaded and hasMore to be properly set
    if (!currentLoadMoreRef || !currentContainerRef || expenses.length === 0 || !hasMore) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        // Add more specific checks to prevent double-firing
        if (entry.isIntersecting && hasMore && !loadingRef.current && !loading) {
          const nextPage = page + 1;
          console.log(`Infinite scroll triggered: loading page ${nextPage}`);
          loadExpenses(nextPage);
        }
      },
      {
        root: currentContainerRef, // Use the scrollable container as root
        threshold: 0.1,
        rootMargin: '100px' // Trigger when 100px from bottom
      }
    );

    observer.observe(currentLoadMoreRef);

    return () => {
      if (currentLoadMoreRef) {
        observer.unobserve(currentLoadMoreRef);
      }
      observer.disconnect();
    };
  }, [hasMore, page, expenses.length, loading, activeTab]); // Include activeTab to ensure proper setup when switching tabs

  const formatAmount = amount => {
    if (amount === null || amount === undefined) return "";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  // Totals component
  const TotalsView = () => {
    if (loadingTotals) {
      return (
        <div className="flex items-center justify-center p-8">
          <span className="text-muted-foreground">Loading totals...</span>
        </div>
      );
    }

    if (totals.length === 0) {
      return (
        <div className="flex items-center justify-center p-8">
          <span className="text-muted-foreground">No categorized expenses found</span>
        </div>
      );
    }

    return (
      <div className="overflow-auto h-[calc(100vh-250px)]">
        <table className="w-full caption-bottom text-sm">
          <thead className="[&_tr]:border-b sticky top-0 z-10">
            <TableRow className="bg-background border-b">
              <TableHead className="bg-background">Category</TableHead>
              <TableHead className="bg-background text-right">Total</TableHead>
            </TableRow>
          </thead>
          <tbody className="[&_tr:last-child]:border-0">
            {totals.map((total, index) => (
              <TableRow key={index}>
                <TableCell className="font-medium">{total.category_name}</TableCell>
                <TableCell className={`text-right font-mono ${
                  total.total_amount >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {formatAmount(total.total_amount)}
                </TableCell>
              </TableRow>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const getAmountClass = amount => {
    if (amount === null || amount === undefined) return "";
    return amount >= 0 ? "text-green-600" : "text-red-600";
  };

  // Progress data comes from backend API

  const formatDate = dateString => {
    if (!dateString) return "";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateString;
    }
  };

  const getColumnValue = (expense, column) => {
    // Handle special columns
    switch (column) {
      case "Category":
        // Return accepted category first, then suggested category as fallback
        return expense.accepted_category_id || expense.suggested_category_id || "";
      case "Action":
        // Action column doesn't return a simple value
        return null;
      case "Status":
        // Personal status overrides all others
        if (expense.is_personal) {
          return "Personal";
        }
        // Status based on accepted vs suggested vs manual vs uncategorized
        if (expense.accepted_category_id) {
          // If there was no suggestion, it's manually set
          if (!expense.suggested_category_id) {
            return "Manual";
          }
          // If category differs from suggestion, it's manually changed
          if (expense.accepted_category_id !== expense.suggested_category_id) {
            return "Manual";
          }
          // Category matches suggestion - it was accepted
          return "Accepted";
        } else if (expense.suggested_category_id) {
          return "Suggested";
        } else {
          return "Uncategorized";
        }
      default:
        // Check if it's in the raw_data
        if (expense.raw_data && expense.raw_data[column]) {
          return expense.raw_data[column];
        }

        // Then check direct properties
        switch (column.toLowerCase()) {
          case "description":
            return expense.description || "";
          case "amount":
            return expense.amount;
          default:
            return "";
        }
    }
  };

  const getCategoryName = (categoryId) => {
    const category = categories.find(cat => cat.id === categoryId);
    return category ? category.name : "";
  };

  // Get all columns including data columns plus Category and Status
  const getColumns = () => {
    if (expenses.length === 0) return [];

    const columnSet = new Set();

    expenses.forEach(expense => {
      if (expense.raw_data) {
        Object.keys(expense.raw_data).forEach(key => columnSet.add(key));
      }
    });

    // Convert to array and sort, putting common columns first
    const columns = Array.from(columnSet);
    const priority = ["Date", "Description", "Amount"];

    // Sort data columns
    const sortedDataColumns = columns.sort((a, b) => {
      const aIndex = priority.indexOf(a);
      const bIndex = priority.indexOf(b);

      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      return a.localeCompare(b);
    });

    // Add Category, Action, and Status columns at the end
    return [...sortedDataColumns, "Action", "Status"];
  };

  const columns = getColumns();

  if (error) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>{project.name}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {project.row_count} rows • {project.original_name}
            </p>
          </CardHeader>
          <CardContent>
            <div className="text-red-600">{error}</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6">
      <Card className="h-[calc(100vh-150px)] overflow-hidden">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <CardTitle>{project.name}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {project.row_count} rows • {project.original_name}
                {activeTab === "expenses" && ` • Showing ${expenses.length} of ${project.row_count}`}
              </p>
              {project?.row_count > 0 && (
                <div className="w-48">
                  <Progress 
                    value={progress.percentage} 
                    className={`h-2 ${progress.isComplete ? '[&>div]:bg-green-500' : ''}`}
                  />
                </div>
              )}
            </div>
            <div className="flex items-center gap-4">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-auto">
                <TabsList>
                  <TabsTrigger value="expenses">Expenses</TabsTrigger>
                  <TabsTrigger value="totals">Totals</TabsTrigger>
                </TabsList>
              </Tabs>
              {activeTab === "expenses" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAiCategorization}
                  disabled={aiCategorizing || loading || expenses.length === 0 || categories.length === 0}
                  className="flex items-center gap-2"
                >
                  <RefreshCw className={`h-4 w-4 ${aiCategorizing ? 'animate-spin' : ''}`} />
                  {aiCategorizing ? 'AI Categorizing...' : (() => {
                    const uncategorizedCount = expenses.filter(e => 
                      !e.accepted_category_id && 
                      !e.suggested_category_id &&
                      !processingRows.has(e.id)
                    ).length;
                    return uncategorizedCount > 0 ? `AI Categorize (${Math.min(uncategorizedCount, 20)})` : 'AI Categorize';
                  })()}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsContent value="expenses">
              <div className="overflow-auto relative h-[calc(100vh-250px)]" ref={containerRef}>
            {columns.length === 0 ? (
              <div className="flex items-center justify-center p-8">
                <span className="text-muted-foreground">Loading...</span>
              </div>
            ) : (
              <>
                <table className="w-full caption-bottom text-sm" ref={tableRef}>
                  <thead className="[&_tr]:border-b sticky top-0 z-10">
                    <TableRow className="bg-background border-b">
                      <TableHead className="w-16 bg-background">#</TableHead>
                      {columns.map(column => (
                        <TableHead 
                          key={column} 
                          className={`bg-background ${
                            column === "Status" ? "text-right" : ""
                          }`}
                        >
                          {column}
                        </TableHead>
                      ))}
                    </TableRow>
                  </thead>
                  <tbody className="[&_tr:last-child]:border-0">
                    {expenses.map((expense, expenseIndex) => (
                      <TableRow 
                        key={expense.id}
                        className={`group cursor-pointer ${
                          activeRowIndex === expenseIndex 
                            ? 'bg-yellow-50 ring-2 ring-blue-300 hover:bg-yellow-50'
                            : expense.is_personal 
                              ? 'bg-gray-100 text-gray-500 hover:bg-gray-100'
                              : 'hover:bg-sky-50'
                        }`}
                        onClick={() => {
                          setIsTableActive(true);
                          setActiveRowIndex(expenseIndex);
                        }}
                      >
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {expense.row_index + 1}
                        </TableCell>
                        {columns.map(column => {
                          const value = getColumnValue(expense, column);
                          const isAmount = column
                            .toLowerCase()
                            .includes("amount");
                          const isDate = column.toLowerCase().includes("date");
                          const isCategory = column === "Category";
                          const isAction = column === "Action";
                          const isStatus = column === "Status";

                          return (
                            <TableCell
                              key={column}
                              className={
                                isAmount
                                  ? `font-mono ${
                                      expense.is_personal && activeRowIndex !== expenseIndex
                                        ? 'text-gray-500'
                                        : getAmountClass(value)
                                    }`
                                  : isStatus
                                    ? "text-sm text-right"
                                    : ""
                              }
                            >
                              {isCategory ? (
                                // Category dropdown with AI suggestions
                                <div className="relative">
                                  <select 
                                    className={`w-full p-1 border rounded text-sm ${
                                      expense.is_personal && activeRowIndex !== expenseIndex
                                        ? 'border-gray-300 bg-gray-100 text-gray-500'
                                        : expense.accepted_category_id 
                                          ? 'border-green-300 bg-green-50' 
                                          : expense.suggested_category_id 
                                            ? 'border-blue-300 bg-blue-50' 
                                            : ''
                                    }`}
                                    value={expense.accepted_category_id ? expense.accepted_category_id.toString() : expense.suggested_category_id ? expense.suggested_category_id.toString() : ""}
                                    onChange={(e) => {
                                      const newCategoryId = e.target.value ? parseInt(e.target.value) : -1;
                                      if (newCategoryId === -1) {
                                        // Clear both accepted and suggested categories (same as Clear action)
                                        updateExpense(expense.id, { 
                                          accepted_category_id: -1,
                                          suggested_category_id: -1 
                                        });
                                        // Update local state immediately with null values for UI
                                        setExpenses(currentExpenses => 
                                          currentExpenses.map(exp => 
                                            exp.id === expense.id 
                                              ? { ...exp, accepted_category_id: null, suggested_category_id: null }
                                              : exp
                                          )
                                        );
                                      } else {
                                        updateExpenseCategory(expense.id, newCategoryId);
                                      }
                                    }}
                                  >
                                    <option value=""></option>
                                    {categories.map(category => {
                                      const isAiSuggested = expense.suggested_category_id === category.id && !expense.accepted_category_id;
                                      return (
                                        <option key={category.id} value={category.id}>
                                          {category.name}{isAiSuggested ? ' 💡' : ''}
                                        </option>
                                      );
                                    })}
                                  </select>
                                </div>
                              ) : isAction ? (
                                // Action column with Accept, Personal, Clear
                                <div className={`flex items-center gap-2 text-xs ${
                                  activeRowIndex === expenseIndex ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                                }`}>
                                  {!expense.suggested_category_id ? (
                                    <span style={{ visibility: 'hidden' }}>Accept</span>
                                  ) : (
                                    <a
                                      className={`underline cursor-pointer ${
                                        expense.accepted_category_id 
                                          ? 'text-gray-400 cursor-not-allowed pointer-events-none' 
                                          : 'text-blue-600 hover:text-blue-800'
                                      }`}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (expense.suggested_category_id && !expense.accepted_category_id) {
                                          handleAcceptSuggestion(expense);
                                        }
                                      }}
                                    >
                                      Accept
                                    </a>
                                  )}
                                  <span className="text-gray-300">|</span>
                                  <label className="flex items-center gap-1 cursor-pointer">
                                    <Checkbox 
                                      checked={expense.is_personal || false}
                                      onCheckedChange={(checked) => {
                                        handleTogglePersonal(expense);
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                    <span 
                                      className="text-gray-600 hover:text-gray-800"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleTogglePersonal(expense);
                                      }}
                                    >
                                      Personal
                                    </span>
                                  </label>
                                  <span className="text-gray-300">|</span>
                                  {!expense.accepted_category_id && !expense.suggested_category_id ? (
                                    <span className="text-gray-400 cursor-not-allowed">Clear</span>
                                  ) : (
                                    <a
                                      className="text-blue-600 hover:text-blue-800 underline cursor-pointer"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handleClearCategory(expense);
                                      }}
                                    >
                                      Clear
                                    </a>
                                  )}
                                </div>
                              ) : isStatus ? (
                                // Status badge with spinners for processing
                                processingRows.has(expense.id) ? (
                                  <div className="flex items-center gap-1">
                                    <RefreshCw className="h-3 w-3 animate-spin text-blue-600" />
                                  </div>
                                ) : (
                                  {value === "Uncategorized" ? (
                                    null
                                  ) : (
                                    <span className={`px-2 py-1 rounded-full text-xs ${
                                      value === "Personal"
                                        ? (activeRowIndex === expenseIndex ? "bg-purple-100 text-purple-800" : "bg-gray-100 text-gray-600")
                                        : value === "Accepted"
                                          ? "bg-green-100 text-green-800" 
                                          : value === "Manual"
                                            ? "bg-orange-100 text-orange-800"
                                            : value === "Suggested"
                                              ? "bg-blue-100 text-blue-800" 
                                              : "bg-gray-100 text-gray-600"
                                    }`}>
                                      {value}
                                    </span>
                                  )}
                                )
                              ) : isAmount && typeof value === "number" ? (
                                formatAmount(value)
                              ) : isDate ? (
                                formatDate(value)
                              ) : (
                                value || ""
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </tbody>
                </table>
                
                {/* Load more sentinel */}
                {hasMore && (
                  <div
                    ref={loadMoreRef}
                    className="flex flex-col items-center justify-center p-4 space-y-2"
                  >
                    {loading ? (
                      <span className="text-muted-foreground">
                        Loading more rows...
                      </span>
                    ) : (
                      <>
                        <span className="text-muted-foreground text-sm">
                          Scroll to load more automatically...
                        </span>
                        <button
                          onClick={() => {
                            if (!loadingRef.current) {
                              const nextPage = page + 1;
                              loadExpenses(nextPage);
                            }
                          }}
                          className="px-4 py-2 text-sm bg-secondary text-secondary-foreground rounded hover:bg-secondary/80"
                          disabled={loadingRef.current}
                        >
                          Or click to load more
                        </button>
                      </>
                    )}
                  </div>
                )}
                
                {!hasMore && expenses.length > 0 && (
                  <div className="flex items-center justify-center p-4">
                    <span className="text-muted-foreground">
                      All {expenses.length} rows loaded
                    </span>
                  </div>
                )}
              </>
            )}
              </div>
            </TabsContent>
            
            <TabsContent value="totals">
              <TotalsView />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default SpreadsheetView;