import { useState, useEffect, useRef } from "react";
import {
  TableCell,
  TableHead,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const SpreadsheetView = ({ project }) => {
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const loadMoreRef = useRef(null);
  const containerRef = useRef(null);
  const loadingRef = useRef(false); // Prevent race conditions
  const LIMIT = 50;

  // Reset when project changes
  useEffect(() => {
    setExpenses([]);
    setPage(0);
    setHasMore(true);
    setError(null);
    loadingRef.current = false;
  }, [project.id]);

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
      
      if (!isInitial) {
        setPage(pageNum);
      }
    } catch (err) {
      console.error("Failed to fetch expenses:", err);
      setError(`Failed to load expenses: ${err.message}`);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  };

  // Load initial data and categories
  useEffect(() => {
    if (project) {
      loadExpenses(0, true);
      fetchCategories();
    }
  }, [project]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch categories
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

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const currentLoadMoreRef = loadMoreRef.current;
    const currentContainerRef = containerRef.current;
    
    if (!currentLoadMoreRef || !currentContainerRef) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && hasMore && !loadingRef.current) {
          const nextPage = page + 1;
          loadExpenses(nextPage);
        }
      },
      {
        root: currentContainerRef, // Use the scrollable container as root
        threshold: 0.1,
        rootMargin: '50px'
      }
    );

    observer.observe(currentLoadMoreRef);

    return () => {
      observer.unobserve(currentLoadMoreRef);
    };
  }, [hasMore, page, expenses.length]); // Add expenses.length to re-run when data changes

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
    return [...sortedDataColumns, "Category"];
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
      <Card>
        <CardHeader>
          <CardTitle>{project.name}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {project.row_count} rows • {project.original_name} • Showing{" "}
            {expenses.length} of {project.row_count}
          </p>
        </CardHeader>

        <CardContent>
          <div className="max-h-[600px] overflow-auto" ref={containerRef}>
            {columns.length === 0 ? (
              <div className="flex items-center justify-center p-8">
                <span className="text-muted-foreground">Loading...</span>
              </div>
            ) : (
              <>
                <table className="w-full caption-bottom text-sm">
                  <thead className="[&_tr]:border-b">
                    <TableRow className="sticky top-0 z-10 bg-background">
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
                                // Category dropdown with actual categories
                                <select 
                                  className="w-full p-1 border rounded text-sm"
                                  value={value ? value.toString() : ""}
                                  onChange={(e) => {
                                    // For now, just log the change - will implement update later
                                    console.log(`Would update expense ${expense.id} to category ${e.target.value}`);
                                  }}
                                >
                                  <option value=""></option>
                                  {categories.map(category => (
                                    <option key={category.id} value={category.id}>
                                      {category.name}
                                    </option>
                                  ))}
                                </select>
                              ) : isStatus ? (
                                // Status badge
                                <span className={`px-2 py-1 rounded-full text-xs ${
                                  value === "Categorized" 
                                    ? "bg-green-100 text-green-800" 
                                    : "bg-gray-100 text-gray-600"
                                }`}>
                                  {value}
                                </span>
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