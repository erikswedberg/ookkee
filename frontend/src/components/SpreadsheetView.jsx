import { useState, useEffect, useCallback, useContext } from "react";
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
import { RefreshCw, Download } from "lucide-react";
import { SpreadsheetContextProvider, SpreadsheetContext } from '../contexts/SpreadsheetContext';
import { TotalsContextProvider } from '../contexts/TotalsContext';
import TotalsView from './TotalsView';
import './Spreadsheet.css';

// Download Totals Button Component
const DownloadTotalsButton = ({ project }) => {
  const downloadCSV = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";
      const response = await fetch(`${API_URL}/api/projects/${project.id}/totals/csv`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `${project.name}-totals.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download CSV:', error);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={downloadCSV}
      className="flex items-center gap-2"
    >
      <Download className="h-4 w-4" />
      Download CSV
    </Button>
  );
};

// Main SpreadsheetTable component
const SpreadsheetTable = () => {
  const {
    expenses,
    categories,
    loading,
    error,
    hasMore,
    page,
    processingRows,
    aiCategorizing,
    isTableActive,
    activeRowIndex,
    setIsTableActive,
    setActiveRowIndex,
    updateExpenseCategory,
    handleTogglePersonal,
    handleAcceptSuggestion,
    handleAiCategorization,
    handleClearCategory,
    setActiveRowWithTabIndex,
    loadMoreRef,
    containerRef,
    tableRef,
    loadingRef,
    loadExpenses,
  } = useContext(SpreadsheetContext);

  // Utility functions
  const formatAmount = amount => {
    if (amount === null || amount === undefined) return "";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(amount);
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

  const getAmountClass = amount => {
    if (amount === null || amount === undefined) return "";
    return amount >= 0 ? "text-green-600" : "text-red-600";
  };

  // Column value getter
  const getColumnValue = (expense, column) => {
    switch (column) {
      case "Category":
        return expense.accepted_category_id || expense.suggested_category_id || "";
      case "Action":
        return null;
      case "Status":
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
      default:
        if (expense.raw_data && expense.raw_data[column]) {
          return expense.raw_data[column];
        }
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

  // Category column renderer
  const renderCategory = (expense) => {
    const getCategoryValue = (expense) => {
      return expense.accepted_category_id ? expense.accepted_category_id.toString() 
           : expense.suggested_category_id ? expense.suggested_category_id.toString() 
           : "";
    };

    const getCategoryClassName = (expense) => {
      const expenseIndex = expenses.indexOf(expense);
      
      if (expense.is_personal && activeRowIndex !== expenseIndex) {
        return "personal";
      }
      
      if (expense.accepted_category_id) {
        return "accepted";
      }
      
      if (expense.suggested_category_id) {
        return "suggested";
      }
      
      return "uncategorized";
    };

    const handleCategoryChange = (e) => {
      const newCategoryId = e.target.value ? parseInt(e.target.value) : -1;
      
      if (newCategoryId === -1) {
        handleClearCategory(expense);
      } else {
        updateExpenseCategory(expense.id, newCategoryId);
      }
    };

    return (
      <div className={`category-column ${getCategoryClassName(expense)}`}>
        <select 
          value={getCategoryValue(expense)}
          onChange={handleCategoryChange}
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
    );
  };

  // Status column renderer
  const renderStatus = (expense) => {
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
    
    const getStatusClassName = (expense) => {
      const status = getStatusValue(expense).toLowerCase();
      return status;
    };
    
    // Show processing spinner if this row is being processed
    if (processingRows.has(expense.id)) {
      return (
        <div className="status-column processing">
          <RefreshCw className="spinner" size={12} />
        </div>
      );
    }
    
    const status = getStatusValue(expense);
    const className = getStatusClassName(expense);
    
    return (
      <div className={`status-column ${className}`}>
        <span className="badge">
          {status}
        </span>
      </div>
    );
  };

  // Action column renderer
  const renderAction = (expense, expenseIndex) => {
    return (
      <div className={`actions ${
        activeRowIndex === expenseIndex ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
      }`}>
        <button
          className={`link ${
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
          disabled={!!expense.accepted_category_id}
          style={{ visibility: expense.suggested_category_id ? 'visible' : 'hidden' }}
        >
          Accept
        </button>
        <span className="separator" style={{ visibility: expense.suggested_category_id ? 'visible' : 'hidden' }}>|</span>
        <label className="checkbox-group">
          <Checkbox 
            checked={expense.is_personal || false}
            onCheckedChange={(checked) => {
              handleTogglePersonal(expense);
            }}
            onClick={(e) => e.stopPropagation()}
          />
          <span 
            onClick={(e) => {
              e.stopPropagation();
              handleTogglePersonal(expense);
            }}
          >
            Personal
          </span>
        </label>
        <span className="separator" style={{ visibility: (expense.accepted_category_id || expense.suggested_category_id) ? 'visible' : 'hidden' }}>|</span>
        <button
          className="link"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleClearCategory(expense);
          }}
          style={{ visibility: (expense.accepted_category_id || expense.suggested_category_id) ? 'visible' : 'hidden' }}
        >
          Clear
        </button>
      </div>
    );
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
  }, [hasMore, page, expenses.length, loading, loadExpenses, loadMoreRef, containerRef, loadingRef]);

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (tableRef.current && !tableRef.current.contains(e.target)) {
        setIsTableActive(false);
        setActiveRowWithTabIndex(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [setIsTableActive, setActiveRowWithTabIndex, tableRef]);

  const columns = getColumns();

  if (columns.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <span className="text-muted-foreground">Loading...</span>
      </div>
    );
  }

  return (
    <div className="spreadsheet overflow-auto relative h-[calc(100vh-250px)]" ref={containerRef}>
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
          {expenses.map((expense, expenseIndex) => {
            const isPersonal = expense.is_personal;
            const isActive = activeRowIndex === expenseIndex;
            
            return (
              <TableRow 
                key={expense.id}
                data-row-index={expenseIndex}
                tabIndex={isActive ? 0 : -1}
                className={`spreadsheet row group cursor-pointer ${
                  isActive
                    ? 'active'
                    : isPersonal 
                      ? 'personal'
                      : 'hover:bg-sky-50'
                }`}
                onClick={() => {
                  setIsTableActive(true);
                  setActiveRowWithTabIndex(expenseIndex);
                }}
              >
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {expense.row_index + 1}
                </TableCell>
                {columns.map(column => {
                  const value = getColumnValue(expense, column);
                  const isAmount = column.toLowerCase().includes("amount");
                  const isDate = column.toLowerCase().includes("date");
                  const isCategory = column === "Category";
                  const isAction = column === "Action";
                  const isStatus = column === "Status";

                  return (
                    <TableCell
                      key={column}
                      className={
                        isAmount
                          ? `font-mono amount ${
                              isPersonal && !isActive
                                ? 'text-gray-500'
                                : getAmountClass(value)
                            }`
                          : isStatus
                            ? "text-sm text-right"
                            : ""
                      }
                    >
                      {isCategory ? (
                        renderCategory(expense)
                      ) : isAction ? (
                        renderAction(expense, expenseIndex)
                      ) : isStatus ? (
                        renderStatus(expense)
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
            );
          })}
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
    </div>
  );
};

// Main SpreadsheetView component with contexts
const SpreadsheetView = ({ project }) => {
  const [activeTab, setActiveTab] = useState("expenses");

  if (!project) {
    return (
      <div className="p-6">
        <Card>
          <CardContent>
            <div className="text-muted-foreground">No project selected</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <SpreadsheetContextProvider project={project}>
      <TotalsContextProvider project={project}>
        <SpreadsheetViewContent project={project} activeTab={activeTab} setActiveTab={setActiveTab} />
      </TotalsContextProvider>
    </SpreadsheetContextProvider>
  );
};

// Main content component using contexts
const SpreadsheetViewContent = ({ project, activeTab, setActiveTab }) => {
  const {
    expenses,
    progress,
    loading,
    error,
    processingRows,
    aiCategorizing,
    categories,
    handleAiCategorization,
  } = useContext(SpreadsheetContext);

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
              {activeTab === "totals" && (
                <DownloadTotalsButton project={project} />
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsContent value="expenses">
              <SpreadsheetTable />
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
