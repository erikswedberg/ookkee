import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { RefreshCw, Trash2, RotateCcw } from 'lucide-react';
import { formatCurrency, formatDate } from '../utils/formatters';
import dayjs from 'dayjs';

// Order categories so the ones relevant to the current lane (tab) come first:
// matching lean, then 'either' (no lean), then the opposite lean. Soft sort
// only — every category remains selectable. Original order preserved within
// each group.
// Categories valid for a row's lane. A row's lane is derived from is_personal
// (personal, else business — business is the default). Only categories whose
// lean matches the lane, or that have no lean ("both"), are offered, alphabetical.
// currentId (if set) is always included so a row's existing category — even a
// now-mismatched one — still shows in its dropdown.
const categoriesForLane = (categories, lane, currentId, unrestricted) => {
  const byName = (a, b) =>
    (a.name || '').localeCompare(b.name || '', undefined, {
      sensitivity: 'base',
    });
  // Miscategorized rows show ALL categories so the user can fix them in either
  // direction (e.g. recategorize a personal row to its correct personal
  // category before, or instead of, moving it to business).
  const allowed = unrestricted
    ? [...categories]
    : categories.filter(c => !c.lean || c.lean === lane || c.id === currentId);
  return allowed.sort(byName);
};

// ExpenseRow2 component for virtual scroll with flex layout and percentage-based column widths
const ExpenseRow2 = ({
  expense,
  expenseIndex,
  categories = [],
  isActive = false, // This will be overridden by calculation below
  processingRows = new Set(),
  activeRowIndex,
  expenses = [],
  handleTogglePersonal,
  updateExpenseCategory,
  handleAcceptSuggestion,
  handleClearCategory,
  handleToggleRemoved,
  approvePersonalSuggestion,
  dismissPersonalSuggestion,
  setIsTableActive,
  setActiveRowWithTabIndex,
  isVisible = true,
  isLoading = false,
  getCurrentExpense,
  viewMode = 'all',
}) => {
  // Get current expense data from store (reactive to updates)
  const currentExpense = getCurrentExpense
    ? getCurrentExpense(expenseIndex)
    : expense;

  // Hide row if not visible (for virtual scroll empty slots)
  if (!isVisible || !currentExpense) {
    return <div className="expense-row-hidden" />;
  }

  const isPersonal = currentExpense.is_personal;
  // In the Personal tab, personal rows are the subject of work and shouldn't be
  // greyed out. Only grey personal rows in the All view.
  const greyPersonal = isPersonal && viewMode !== 'personal';
  // AI suggested this row is personal and the user hasn't confirmed/dismissed.
  const hasPersonalSuggestion =
    !isPersonal && currentExpense.suggested_is_personal === true;

  // Miscategorized: the accepted category's lean conflicts with the row's lane
  // (personal row filed under a business-only category, or vice versa).
  const rowLane = isPersonal ? 'personal' : 'business';
  const acceptedCat = currentExpense.accepted_category_id
    ? categories.find(c => c.id === currentExpense.accepted_category_id)
    : null;
  const isMiscategorized =
    !!acceptedCat && !!acceptedCat.lean && acceptedCat.lean !== rowLane;

  // Calculate if this row is active based on expenseIndex and activeRowIndex
  const isRowActive = activeRowIndex === expenseIndex;

  // EXACT copy of utility functions from original SpreadsheetView
  const formatAmount = amount => {
    if (amount === null || amount === undefined) return '';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const getAmountClass = amount => {
    if (amount === null || amount === undefined) return '';
    return amount >= 0 ? 'text-green-600' : 'text-red-600';
  };

  // EXACT copy of getColumnValue from original
  const getColumnValue = (expense, column) => {
    switch (column) {
      case 'Source':
        return currentExpense.source || '';
      case 'Date':
        // Prefer the backend-parsed ISO date; fall back to the raw string
        // for rows that couldn't be parsed.
        return currentExpense.date || currentExpense.date_text || '';
      case 'Description':
        return currentExpense.description || '';
      case 'Amount':
        return currentExpense.amount;
      case 'Category':
        return (
          currentExpense.accepted_category_id ||
          currentExpense.suggested_category_id ||
          ''
        );
      case 'Action':
        return null;
      case 'Status':
        if (currentExpense.is_personal) return 'Personal';
        if (currentExpense.accepted_category_id) {
          if (!currentExpense.suggested_category_id) return 'Manual';
          if (
            currentExpense.accepted_category_id !==
            currentExpense.suggested_category_id
          )
            return 'Manual';
          return 'Accepted';
        } else if (currentExpense.suggested_category_id) {
          return 'Suggested';
        } else {
          return 'Uncategorized';
        }
      default:
        return '';
    }
  };

  // EXACT copy of renderCategory from original
  const renderCategory = expense => {
    const getCategoryValue = expense => {
      return currentExpense.accepted_category_id
        ? currentExpense.accepted_category_id.toString()
        : currentExpense.suggested_category_id
          ? currentExpense.suggested_category_id.toString()
          : '';
    };

    const getCategoryClassName = expense => {
      const expenseIndex = expenses.indexOf(currentExpense);

      if (greyPersonal && activeRowIndex !== expenseIndex) {
        return 'personal';
      }

      if (currentExpense.accepted_category_id) {
        return 'accepted';
      }

      if (currentExpense.suggested_category_id) {
        return 'suggested';
      }

      return 'uncategorized';
    };

    const handleCategoryChange = e => {
      const newCategoryId = e.target.value ? parseInt(e.target.value) : -1;

      if (newCategoryId === -1) {
        handleClearCategory(currentExpense);
      } else {
        // Manual dropdown selection offers propagation (true).
        updateExpenseCategory(currentExpense.id, newCategoryId, true);
      }
    };

    return (
      <div
        className={`category-column ${getCategoryClassName(currentExpense)}`}
      >
        <select
          value={getCategoryValue(currentExpense)}
          onChange={handleCategoryChange}
          onClick={e => e.stopPropagation()}
          style={{ maxWidth: '220px' }}
        >
          <option value=""></option>
          {categoriesForLane(
            categories,
            currentExpense.is_personal ? 'personal' : 'business',
            currentExpense.accepted_category_id ||
              currentExpense.suggested_category_id,
            isMiscategorized
          ).map(category => {
            const isAiSuggested =
              currentExpense.suggested_category_id === category.id &&
              !currentExpense.accepted_category_id;
            return (
              <option key={category.id} value={category.id}>
                {category.name}
                {isAiSuggested ? ' 💡' : ''}
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
      if (currentExpense.is_personal) return 'Personal';
      if (hasPersonalSuggestion) return 'Personal?';

      if (currentExpense.accepted_category_id) {
        if (!currentExpense.suggested_category_id) return 'Manual';
        if (
          currentExpense.accepted_category_id !==
          currentExpense.suggested_category_id
        )
          return 'Manual';
        return 'Accepted';
      } else if (currentExpense.suggested_category_id) {
        return 'Suggested';
      } else {
        return 'Uncategorized';
      }
    };

    const getStatusClassName = expense => {
      const status = getStatusValue(currentExpense).toLowerCase();
      return status;
    };

    // Show processing spinner if this row is being processed
    if (processingRows.has(currentExpense.id)) {
      return (
        <div className="status-column processing">
          <RefreshCw className="spinner" size={12} />
        </div>
      );
    }

    const status = getStatusValue(currentExpense);
    const className = getStatusClassName(currentExpense);

    if (hasPersonalSuggestion) {
      return (
        <div className="status-column">
          <span className="badge bg-amber-200 text-amber-900 px-2 py-0.5 rounded">
            {status}
          </span>
        </div>
      );
    }

    return (
      <div className={`status-column ${className}`}>
        <span className="badge">{status}</span>
      </div>
    );
  };

  // EXACT copy of renderAction from original
  const renderAction = (expense, expenseIndex) => {
    // When AI suggests personal, the action column offers Approve / Dismiss so
    // the user can act on it directly. Always visible (not hover-gated) so the
    // suggestion is obvious.
    if (hasPersonalSuggestion) {
      return (
        <div className="actions opacity-100">
          <button
            className="link text-amber-700 hover:text-amber-900 font-medium"
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
              approvePersonalSuggestion(currentExpense);
            }}
          >
            Approve
          </button>
          <span className="separator">|</span>
          <button
            className="link text-gray-500 hover:text-gray-700"
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
              dismissPersonalSuggestion(currentExpense);
            }}
          >
            Dismiss
          </button>
        </div>
      );
    }

    return (
      <div
        className={`actions ${
          activeRowIndex === expenseIndex
            ? 'opacity-100'
            : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        <button
          className={`link ${
            currentExpense.accepted_category_id
              ? 'text-gray-400 cursor-not-allowed pointer-events-none'
              : 'text-blue-600 hover:text-blue-800'
          }`}
          onClick={e => {
            e.preventDefault();
            e.stopPropagation();
            if (
              currentExpense.suggested_category_id &&
              !currentExpense.accepted_category_id
            ) {
              handleAcceptSuggestion(currentExpense);
            }
          }}
          disabled={!!currentExpense.accepted_category_id}
          style={{
            visibility: currentExpense.suggested_category_id
              ? 'visible'
              : 'hidden',
          }}
        >
          Accept
        </button>
        <span
          className="separator"
          style={{
            visibility:
              currentExpense.suggested_category_id &&
              (currentExpense.accepted_category_id ||
                currentExpense.suggested_category_id)
                ? 'visible'
                : 'hidden',
          }}
        >
          |
        </span>
        <button
          className="link"
          onClick={e => {
            e.preventDefault();
            e.stopPropagation();
            handleClearCategory(currentExpense);
          }}
          style={{
            visibility:
              currentExpense.accepted_category_id ||
              currentExpense.suggested_category_id
                ? 'visible'
                : 'hidden',
          }}
        >
          Clear
        </button>
      </div>
    );
  };

  // Get fixed columns as specified: Source, Date, Description, Amount, Category, Action, Status
  const getColumns = () => {
    return [
      'Source',
      'Date',
      'Description',
      'Amount',
      'Category',
      'Action',
      'Status',
    ];
  };

  const columns = getColumns();

  // Virtual scroll div structure with flex layout and nth-child column widths
  return (
    <div
      data-row-index={expenseIndex}
      tabIndex={isRowActive ? 0 : -1}
      className={`scroll-row border-b spreadsheet row group cursor-pointer text-sm ${
        isRowActive
          ? 'active'
          : isMiscategorized
            ? 'bg-red-100 hover:bg-red-200'
            : hasPersonalSuggestion
              ? 'bg-amber-50 hover:bg-amber-100'
              : greyPersonal
                ? 'personal'
                : 'hover:bg-sky-50'
      }`}
      onClick={() => {
        setIsTableActive(true);
        setActiveRowWithTabIndex(expenseIndex);
      }}
    >
      <div className="scroll-column text-center">
        <span
          className={`inline-flex items-center justify-center rounded ${
            !currentExpense.is_personal &&
            currentExpense.suggested_is_personal === true
              ? 'ring-2 ring-amber-400 ring-offset-1 p-0.5'
              : ''
          }`}
          title={
            !currentExpense.is_personal &&
            currentExpense.suggested_is_personal === true
              ? 'AI suggests Personal — click to confirm'
              : undefined
          }
        >
          <Checkbox
            checked={currentExpense.is_personal || false}
            onCheckedChange={() => {
              handleTogglePersonal(currentExpense);
            }}
            onClick={e => e.stopPropagation()}
          />
        </span>
      </div>
      <div className="scroll-column font-mono text-xs text-muted-foreground">
        <span className="content">
          {isLoading ? null : currentExpense.row_index + 1}
        </span>
      </div>
      {columns.map(column => {
        const value = getColumnValue(currentExpense, column);
        const isAmount = column === 'Amount';
        const isDate = column === 'Date';
        const isDescription = column === 'Description';
        const isCategory = column === 'Category';
        const isAction = column === 'Action';
        const isStatus = column === 'Status';
        const isSource = column === 'Source';
        return (
          <div
            key={column}
            className={`scroll-column ${
              isAmount
                ? `font-mono amount text-sm ${
                    greyPersonal && !isRowActive
                      ? 'text-gray-500'
                      : getAmountClass(value)
                  }`
                : isStatus
                  ? 'text-sm justify-end'
                  : ''
            }`}
          >
            {isLoading ? null : isCategory ? (
              <div className="content">{renderCategory(currentExpense)}</div>
            ) : isAction ? (
              <div className="actions">
                {renderAction(currentExpense, expenseIndex)}
              </div>
            ) : isStatus ? (
              <div className="content">{renderStatus(currentExpense)}</div>
            ) : isDescription ? (
              <div className="truncated content">{value || ''}</div>
            ) : isAmount && typeof value === 'number' ? (
              <div className="content">{formatAmount(value)}</div>
            ) : isDate ? (
              <div className="content">{formatDate(value)}</div>
            ) : isSource ? (
              <div className="truncated content">{value || ''}</div>
            ) : (
              <div className="content">{value || ''}</div>
            )}
          </div>
        );
      })}
      {/* Remove / Restore action column */}
      <div className="scroll-column text-center">
        {!isLoading && (
          <button
            className={`remove-action ${
              isRowActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
            title={viewMode === 'removed' ? 'Restore item' : 'Remove item'}
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
              handleToggleRemoved(currentExpense, viewMode !== 'removed');
            }}
          >
            {viewMode === 'removed' ? (
              <RotateCcw size={15} />
            ) : (
              <Trash2 size={15} />
            )}
          </button>
        )}
      </div>
    </div>
  );
};

export default ExpenseRow2;
