import { useState, useEffect, useCallback, useContext } from "react";
import { TableCell, TableHead, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DualProgress } from "@/components/ui/dual-progress";
import { SplitButton } from "@/components/ui/split-button";
import { RefreshCw, Download } from "lucide-react";
import dayjs from "dayjs";
import {
  SpreadsheetContextProvider,
  SpreadsheetContext,
} from "../contexts/SpreadsheetContext";
import { TotalsContextProvider } from "../contexts/TotalsContext";
import TotalsView from "./TotalsView";
import ExpenseTableVirtual from "./ExpenseTableVirtual";
import ExpenseRow from "./ExpenseRow";
import "./Spreadsheet.css";

// Download Totals Button Component
const DownloadTotalsButton = ({ project }) => {
  const downloadCSV = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";
      const response = await fetch(
        `${API_URL}/api/projects/${project.id}/totals/csv`
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `${project.name}-totals.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to download CSV:", error);
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

  // Get fixed columns as specified: Source, Date, Description, Amount, Category, Action, Status
  const getColumns = () => {
    return ["Source", "Date", "Description", "Amount", "Category", "Action", "Status"];
  };

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const currentLoadMoreRef = loadMoreRef.current;
    const currentContainerRef = containerRef.current;

    // Wait for expenses to be loaded and hasMore to be properly set
    if (
      !currentLoadMoreRef ||
      !currentContainerRef ||
      expenses.length === 0 ||
      !hasMore
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      entries => {
        const [entry] = entries;
        // Add more specific checks to prevent double-firing
        if (
          entry.isIntersecting &&
          hasMore &&
          !loadingRef.current &&
          !loading
        ) {
          const nextPage = page + 1;
          console.log(`Infinite scroll triggered: loading page ${nextPage}`);
          loadExpenses(nextPage);
        }
      },
      {
        root: currentContainerRef, // Use the scrollable container as root
        threshold: 0.1,
        rootMargin: "100px", // Trigger when 100px from bottom
      }
    );

    observer.observe(currentLoadMoreRef);

    return () => {
      if (currentLoadMoreRef) {
        observer.unobserve(currentLoadMoreRef);
      }
      observer.disconnect();
    };
  }, [
    hasMore,
    page,
    expenses.length,
    loading,
    loadExpenses,
    loadMoreRef,
    containerRef,
    loadingRef,
  ]);

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = e => {
      if (tableRef.current && !tableRef.current.contains(e.target)) {
        setIsTableActive(false);
        setActiveRowWithTabIndex(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [setIsTableActive, setActiveRowWithTabIndex, tableRef]);

  const columns = getColumns();

  if (expenses.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <span className="text-muted-foreground">Loading...</span>
      </div>
    );
  }

  return (
    <div
      className="spreadsheet overflow-auto relative h-[calc(100vh-250px)]"
      ref={containerRef}
    >
      <table className="w-full caption-bottom text-sm" ref={tableRef}>
        <thead className="[&_tr]:border-b sticky top-0 z-10">
          <TableRow className="bg-background border-b">
            <TableHead className="w-12 bg-background"></TableHead>
            <TableHead className="w-16 bg-background">#</TableHead>
            {columns.map(column => (
              <TableHead
                key={column}
                className={`bg-background ${
                  column === "Status" ? "text-right" : ""
                }`}
                style={{
                  minWidth: column === "Category" ? "175px" : undefined
                }}
              >
                {column}
              </TableHead>
            ))}
          </TableRow>
        </thead>
        <tbody className="[&_tr:last-child]:border-0">
          {expenses.map((expense, expenseIndex) => {
            const isActive = activeRowIndex === expenseIndex;

            return (
              <ExpenseRow
                key={expense.id}
                expense={expense}
                expenseIndex={expenseIndex}
                categories={categories}
                isActive={isActive}
                processingRows={processingRows}
                onTogglePersonal={(expenseId, isPersonal) => {
                  handleTogglePersonal(expense);
                }}
                onUpdateCategory={(expenseId, categoryId) => {
                  updateExpenseCategory(expenseId, categoryId);
                }}
                onAcceptSuggestion={(expense) => {
                  handleAcceptSuggestion(expense);
                }}
                onClearCategory={(expense) => {
                  handleClearCategory(expense);
                }}
                onClick={(expenseIndex) => {
                  setIsTableActive(true);
                  setActiveRowWithTabIndex(expenseIndex);
                }}
              />
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
            <span className="text-muted-foreground">Loading more rows...</span>
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
const SpreadsheetView = ({ project, isSidebarCollapsed, onToggleSidebar }) => {
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
        <SpreadsheetViewContent
          project={project}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebar={onToggleSidebar}
        />
      </TotalsContextProvider>
    </SpreadsheetContextProvider>
  );
};

// Main content component using contexts
const SpreadsheetViewContent = ({ project, activeTab, setActiveTab, isSidebarCollapsed, onToggleSidebar }) => {
  const {
    expenses,
    progress,
    loading,
    error,
    processingRows,
    aiCategorizing,
    autoplayMode,
    categories,
    handleAiCategorization,
    toggleAutoplay,
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
    <div>
      <Card className="h-[calc(100vh-50px)] overflow-hidden rounded-none border-0 shadow-none">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <button 
                  onClick={onToggleSidebar}
                  className="text-muted-foreground hover:text-foreground transition-colors text-sm"
                  title={isSidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
                >
                  {isSidebarCollapsed ? "→" : "←"}
                </button>
                <CardTitle>{project.name}</CardTitle>
              </div>
              <p className="text-sm text-muted-foreground">
                {project.row_count} rows • {project.original_name}
                {activeTab === "expenses" &&
                  ` • Showing ${expenses.length} of ${project.row_count}`}
              </p>
              {project?.row_count > 0 && (
                <div className="w-48">
                  <DualProgress
                    suggestedValue={progress.total_count > 0 ? ((progress.total_count - progress.uncategorized_count) / progress.total_count) * 100 : 0}
                    acceptedValue={progress.total_count > 0 ? (progress.categorized_count / progress.total_count) * 100 : 0}
                    className="h-2"
                  />
                </div>
              )}
            </div>
            <div className="flex items-center gap-4">
              <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className="w-auto"
              >
                <TabsList>
                  <TabsTrigger value="expenses">Expenses</TabsTrigger>
                  <TabsTrigger value="expenses2">Expenses 2</TabsTrigger>
                  <TabsTrigger value="totals">Totals</TabsTrigger>
                </TabsList>
              </Tabs>
              {activeTab === "expenses" && (
                <SplitButton
                  variant="outline"
                  size="sm"
                  onClick={handleAiCategorization}
                  onTogglePlay={toggleAutoplay}
                  isPlaying={autoplayMode}
                  disabled={
                    loading ||
                    expenses.length === 0 ||
                    categories.length === 0
                  }
                  playDisabled={
                    loading ||
                    expenses.length === 0 ||
                    categories.length === 0
                  }
                  className="flex items-center"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${aiCategorizing ? "animate-spin" : ""}`}
                  />
                  {aiCategorizing
                    ? "AI Categorizing..."
                    : (() => {
                        const uncategorizedCount = progress.uncategorized_count || 0;
                        return uncategorizedCount > 0
                          ? `AI Categorize (${Math.min(uncategorizedCount, 20)})`
                          : "AI Categorize";
                      })()}
                </SplitButton>
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

            <TabsContent value="expenses2">
              <ExpenseTableVirtual 
                projectId={project?.id}
                totalExpenses={progress?.total_count || 0}
              />
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
