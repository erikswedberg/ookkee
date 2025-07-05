import React from 'react';
import { TableRow, TableCell } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { RefreshCw } from "lucide-react";
import { formatCurrency, formatDate } from '../utils/formatters';

// Shared ExpenseRow component for both regular and virtual tables
const ExpenseRow = ({ 
  expense, 
  expenseIndex, 
  categories = [], 
  isActive = false,
  processingRows = new Set(),
  onTogglePersonal,
  onUpdateCategory,
  onAcceptSuggestion,
  onClearCategory,
  onClick
}) => {
  const isPersonal = expense.is_personal;
  
  // Amount formatting and styling
  const formatAmount = amount => {
    if (amount === null || amount === undefined) return "";
    return formatCurrency(amount);
  };

  const getAmountClass = amount => {
    if (amount === null || amount === undefined) return "";
    return amount >= 0 ? "text-green-600" : "text-red-600";
  };

  // Column value getter
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

  // Category column renderer
  const renderCategory = expense => {
    const getCategoryValue = expense => {
      return expense.accepted_category_id
        ? expense.accepted_category_id.toString()
        : expense.suggested_category_id
          ? expense.suggested_category_id.toString()
          : "";
    };

    const getCategoryClassName = expense => {
      if (expense.is_personal && !isActive) {
        return "text-gray-500";
      }
      
      if (expense.accepted_category_id) {
        return "accepted";
      } else if (expense.suggested_category_id) {
        return "suggested";
      } else {
        return "uncategorized";
      }
    };

    return (
      <div className={`category-selection ${getCategoryClassName(expense)}`}>
        <select
          value={getCategoryValue(expense)}
          onChange={e => {
            const categoryId = e.target.value ? parseInt(e.target.value) : null;
            onUpdateCategory?.(expense.id, categoryId);
          }}
          className="
            w-full p-1 text-xs border rounded
            focus:border-blue-600 focus:ring-2 focus:ring-blue-200
            hover:border-gray-400
          "
        >
          <option value="">Select category...</option>
          {categories.map(category => {
            const isAiSuggested = category.id === expense.suggested_category_id;
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

  // Status column renderer
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

  // Action column renderer
  const renderAction = (expense, expenseIndex) => {
    return (
      <div
        className={`actions ${
          isActive
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
              onAcceptSuggestion?.(expense);
            }
          }}
        >
          Accept
        </button>
        {" | "}
        <button
          className={`link text-red-600 hover:text-red-800 ${
            expense.accepted_category_id || expense.suggested_category_id
              ? "visible"
              : "hidden"
          }`}
          onClick={e => {
            e.preventDefault();
            e.stopPropagation();
            onClearCategory?.(expense);
          }}
        >
          Clear
        </button>
      </div>
    );
  };

  // Get fixed columns
  const columns = ["Source", "Date", "Description", "Amount", "Category", "Action", "Status"];

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
      onClick={() => onClick?.(expenseIndex)}
    >
      {/* Personal Checkbox */}
      <TableCell className="w-12">
        <Checkbox
          checked={isPersonal}
          onCheckedChange={checked => onTogglePersonal?.(expense.id, checked)}
          className="focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-opacity-30 !important"
        />
      </TableCell>
      
      {/* Row Index */}
      <TableCell className="w-16 font-mono text-xs text-muted-foreground">
        {expense.row_index + 1}
      </TableCell>
      
      {/* Dynamic Columns */}
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
