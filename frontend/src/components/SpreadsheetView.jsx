import { useState, useEffect, useRef } from "react";
import {
  TableCell,
  TableHead,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useAiCategorizer } from "../hooks/useAiCategorizer";

const SpreadsheetView = ({ project }) => {
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [processingRows, setProcessingRows] = useState(new Set()); // Track rows being AI processed
  const loadMoreRef = useRef(null);
  const containerRef = useRef(null);
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
      
      // Force a state update to ensure UI refreshes immediately
      setExpenses(currentExpenses => {
        const updatedExpenses = currentExpenses.map(expense => {
          const suggestion = getSuggestionForRow(expense.id);
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
  }, [hasMore, page, expenses.length, loading]); // Include expenses.length and loading to ensure proper setup

  const formatAmount = amount => {
    if (amount === null || amount === undefined) return "";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const getAmountClass = amount => {
    if (amount === null || amount === undefined) return "";
    return amount >= 0 ? "text-green-600" : "text-red-600";
  };

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
        // Return the category ID for the dropdown
        return expense.accepted_category_id || "";
      case "Status":
        // Simple status based on whether category is assigned
        return expense.accepted_category_id ? "Categorized" : "Uncategorized";
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

    // Add Category column at the end
    return [...sortedDataColumns, "Status"];
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
            <div>
              <CardTitle>{project.name}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {project.row_count} rows • {project.original_name} • Showing{" "}
                {expenses.length} of {project.row_count}
              </p>
            </div>
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
          </div>
        </CardHeader>

        <CardContent>
          <div className="overflow-auto relative h-[calc(100vh-250px)]" ref={containerRef}>
            {columns.length === 0 ? (
              <div className="flex items-center justify-center p-8">
                <span className="text-muted-foreground">Loading...</span>
              </div>
            ) : (
              <>
                <table className="w-full caption-bottom text-sm">
                  <thead className="[&_tr]:border-b sticky top-0 z-10">
                    <TableRow className="bg-background border-b">
                      <TableHead className="w-16 bg-background">#</TableHead>
                      {columns.map(column => (
                        <TableHead key={column} className="bg-background">{column}</TableHead>
                      ))}
                    </TableRow>
                  </thead>
                  <tbody className="[&_tr:last-child]:border-0">
                    {expenses.map(expense => (
                      <TableRow key={expense.id}>
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
                          const isStatus = column === "Status";

                          return (
                            <TableCell
                              key={column}
                              className={
                                isAmount
                                  ? `font-mono ${getAmountClass(value)}`
                                  : isStatus
                                    ? "text-sm"
                                    : ""
                              }
                            >
                              {isCategory ? (
                                // Category dropdown with AI suggestions
                                <div className="relative">
                                  <select 
                                    className={`w-full p-1 border rounded text-sm ${
                                      expense.suggested_category_id ? 'border-blue-300 bg-blue-50' : ''
                                    }`}
                                    value={value ? value.toString() : expense.suggested_category_id ? expense.suggested_category_id.toString() : ""}
                                    onChange={(e) => {
                                      // For now, just log the change - will implement update later
                                      console.log(`Would update expense ${expense.id} to category ${e.target.value}`);
                                    }}
                                  >
                                    <option value=""></option>
                                    {categories.map(category => {
                                      const isAiSuggested = expense.suggested_category_id === category.id;
                                      return (
                                        <option key={category.id} value={category.id}>
                                          {category.name}{isAiSuggested ? ' 💡' : ''}
                                        </option>
                                      );
                                    })}
                                  </select>
                                  {expense.suggested_category_id && (
                                    <div className="absolute -top-2 -right-2 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                                      <span className="text-white text-xs font-bold">AI</span>
                                    </div>
                                  )}
                                </div>
                              ) : isStatus ? (
                                // Status badge with spinners for processing
                                processingRows.has(expense.id) ? (
                                  <div className="flex items-center gap-1">
                                    <RefreshCw className="h-3 w-3 animate-spin text-blue-600" />
                                  </div>
                                ) : (
                                  <span className={`px-2 py-1 rounded-full text-xs ${
                                    expense.suggested_category_id && !expense.accepted_category_id
                                      ? "bg-blue-100 text-blue-800" 
                                      : value === "Categorized" 
                                        ? "bg-green-100 text-green-800" 
                                        : "bg-gray-100 text-gray-600"
                                  }`}>
                                    {expense.suggested_category_id && !expense.accepted_category_id 
                                      ? "Suggested" 
                                      : value}
                                  </span>
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
        </CardContent>
      </Card>
    </div>
  );
};

export default SpreadsheetView;