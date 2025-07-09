import React from 'react';
import { Checkbox } from "@/components/ui/checkbox";
import { TableCell, TableRow } from "@/components/ui/table";
import { RefreshCw } from "lucide-react";
import { formatCurrency, formatDate } from '../utils/formatters';
import dayjs from 'dayjs';

// ExpenseRow component for traditional HTML table context
const ExpenseRow = ({ 
  expense, 
  expenseIndex, 
  categories = [], 
  isActive = false,
  processingRows = new Set(),
  activeRowIndex,
  expenses = [],
  handleTogglePersonal,
  updateExpenseCategory,
  handleAcceptSuggestion,
  handleClearCategory,
  setIsTableActive,
  setActiveRowWithTabIndex,
  isVisible = true
}) => {
  // Hide row if not visible (for virtual scroll empty slots)
  if (!isVisible || !expense) {
    return <div className="expense-row-hidden" />;
  }
  
  const isPersonal = expense.is_personal;
  
  // EXACT copy of utility functions from original SpreadsheetView
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

  // EXACT copy of getColumnValue from original
  const getColumnValue = (expense, column) => {
    switch (column) {
      case "Source":
        return expense.source || "";
      case "Date":
        return expense.date_text || "";
      case "Description":
        return expense.description || "";
      case "Amount":
        return expense.amount;
      case "Category":
        return (
          expense.accepted_category_id || expense.suggested_category_id || ""
        );
      case "Action":
        return null;
      case "Status":
        if (expense.is_personal) return "Personal";
        if (expense.accepted_category_id) {
          if (!expense.suggested_category_id) return "Manual";
          if (expense.accepted_category_id !== expense.suggested_category_id)
            return "Manual";
          return "Accepted";
        } else if (expense.suggested_category_id) {
          return "Suggested";
        } else {
          return "Uncategorized";
        }
      default:
        return "";
    }
  };

  // EXACT copy of renderCategory from original
  const renderCategory = expense => {
    const getCategoryValue = expense => {
      return expense.accepted_category_id
        ? expense.accepted_category_id.toString()
        : expense.suggested_category_id
          ? expense.suggested_category_id.toString()
          : "";
    };

    const getCategoryClassName = expense => {
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

    const handleCategoryChange = e => {
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
            const isAiSuggested =
              expense.suggested_category_id === category.id &&
              !expense.accepted_category_id;
            return (
              <option key={category.id} value={category.id}>
                {category.name}
                {isAiSuggested ? " 💡" : ""}
              </option>
            );
          })}
        </select>
      </div>
    );
  };

  // EXACT copy of renderStatus from original
  const renderStatus = expense => {
    const getStatusValue = expense => {
      if (expense.is_personal) return "Personal";

      if (expense.accepted_category_id) {
        if (!expense.suggested_category_id) return "Manual";
        if (expense.accepted_category_id !== expense.suggested_category_id)
          return "Manual";
        return "Accepted";
      } else if (expense.suggested_category_id) {
        return "Suggested";
      } else {
        return "Uncategorized";
      }
    };

    const getStatusClassName = expense => {
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
        <span className="badge">{status}</span>
      </div>
    );
  };

  // EXACT copy of renderAction from original
  const renderAction = (expense, expenseIndex) => {
    return (
      <div
        className={`actions ${
          activeRowIndex === expenseIndex
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100"
        }`}
      >
        <button
          className={`link ${
            expense.accepted_category_id
              ? "text-gray-400 cursor-not-allowed pointer-events-none"
              : "text-blue-600 hover:text-blue-800"
          }`}
          onClick={e => {
            e.preventDefault();
            e.stopPropagation();
            if (
              expense.suggested_category_id &&
              !expense.accepted_category_id
            ) {
              handleAcceptSuggestion(expense);
            }
          }}
          disabled={!!expense.accepted_category_id}
          style={{
            visibility: expense.suggested_category_id ? "visible" : "hidden",
          }}
        >
          Accept
        </button>
        <span
          className="separator"
          style={{
            visibility:
              expense.suggested_category_id &&
              (expense.accepted_category_id || expense.suggested_category_id)
                ? "visible"
                : "hidden",
          }}
        >
          |
        </span>
        <button
          className="link"
          onClick={e => {
            e.preventDefault();
            e.stopPropagation();
            handleClearCategory(expense);
          }}
          style={{
            visibility:
              expense.accepted_category_id || expense.suggested_category_id
                ? "visible"
                : "hidden",
          }}
        >
          Clear
        </button>
      </div>
    );
  };

  // Get fixed columns as specified: Source, Date, Description, Amount, Category, Action, Status
  const getColumns = () => {
    return ["Source", "Date", "Description", "Amount", "Category", "Action", "Status"];
  };

  const columns = getColumns();

  // Traditional HTML table structure
  return (
    <TableRow
      data-row-index={expenseIndex}
      tabIndex={isActive ? 0 : -1}
      className={`spreadsheet row group cursor-pointer ${
        isActive
          ? "active"
          : isPersonal
            ? "personal"
            : "hover:bg-sky-50"
      }`}
      onClick={() => {
        setIsTableActive(true);
        setActiveRowWithTabIndex(expenseIndex);
      }}
    >
      <TableCell className="text-center w-12">
        <Checkbox
          checked={expense.is_personal || false}
          onCheckedChange={() => {
            handleTogglePersonal(expense);
          }}
          onClick={e => e.stopPropagation()}
        />
      </TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground w-16">
        {expense.row_index + 1}
      </TableCell>
      {columns.map(column => {
        const value = getColumnValue(expense, column);
        const isAmount = column === "Amount";
        const isDate = column === "Date";
        const isDescription = column === "Description";
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
                      ? "text-gray-500"
                      : getAmountClass(value)
                  }`
                : isStatus
                  ? "text-sm text-right"
                  : ""
            }
            style={{
              minWidth: column === "Category" ? "175px" : undefined
            }}
          >
            {isCategory
              ? renderCategory(expense)
              : isAction
                ? renderAction(expense, expenseIndex)
                : isStatus
                  ? renderStatus(expense)
                  : isDescription
                    ? (
                        <div style={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          lineHeight: '1.3',
                          maxHeight: '2.6em'
                        }}>
                          {value || ''}
                        </div>
                      )
                    : isAmount && typeof value === "number"
                      ? formatAmount(value)
                      : isDate
                        ? formatDate(value)
                        : value || ""}
          </TableCell>
        );
      })}
    </TableRow>
  );
};

export default ExpenseRow;
