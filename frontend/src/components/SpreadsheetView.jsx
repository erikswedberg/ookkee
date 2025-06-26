import { useState, useEffect, useRef } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const SpreadsheetView = ({ project }) => {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const loadMoreRef = useRef(null);
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

  // Load initial data
  useEffect(() => {
    if (project) {
      loadExpenses(0, true);
    }
  }, [project]); // eslint-disable-line react-hooks/exhaustive-deps

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && hasMore && !loadingRef.current) {
          const nextPage = page + 1;
          loadExpenses(nextPage);
        }
      },
      {
        threshold: 0.1,
        rootMargin: '100px'
      }
    );

    const currentLoadMoreRef = loadMoreRef.current;
    if (currentLoadMoreRef) {
      observer.observe(currentLoadMoreRef);
    }

    return () => {
      if (currentLoadMoreRef) {
        observer.unobserve(currentLoadMoreRef);
      }
    };
  }, [hasMore, page]);

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
    // First check if it's in the raw_data
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
  };

  // Get all unique columns from the data
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
    const priority = ["Date", "Description", "Amount", "Category"];

    return columns.sort((a, b) => {
      const aIndex = priority.indexOf(a);
      const bIndex = priority.indexOf(b);

      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      return a.localeCompare(b);
    });
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
          <div className="max-h-[600px] overflow-auto">
            {columns.length === 0 ? (
              <div className="flex items-center justify-center p-8">
                <span className="text-muted-foreground">Loading...</span>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                      <TableHead className="w-16 sticky top-0 bg-background">#</TableHead>
                      {columns.map(column => (
                        <TableHead key={column} className="sticky top-0 bg-background">{column}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
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

                          return (
                            <TableCell
                              key={column}
                              className={
                                isAmount
                                  ? `font-mono ${getAmountClass(value)}`
                                  : ""
                              }
                            >
                              {isAmount && typeof value === "number"
                                ? formatAmount(value)
                                : isDate
                                  ? formatDate(value)
                                  : value || ""}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                
                {/* Load more sentinel */}
                {hasMore && (
                  <div
                    ref={loadMoreRef}
                    className="flex items-center justify-center p-4"
                  >
                    {loading ? (
                      <span className="text-muted-foreground">
                        Loading more rows...
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        Scroll to load more...
                      </span>
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