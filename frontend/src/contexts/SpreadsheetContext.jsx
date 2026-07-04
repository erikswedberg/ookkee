import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useRef,
} from 'react';
import { toast } from 'sonner';
import useExpenseStore from '../stores/expenseStore';
// Removed useAiCategorizer import - now using simplified backend-driven approach

const spreadsheetInitialValues = {
  // Data state
  expenses: [],
  categories: [],
  progress: {
    percentage: 0,
    isComplete: false,
    total_count: 0,
    categorized_count: 0,
    uncategorized_count: 0,
  },

  // Loading states
  loading: false,
  error: null,
  hasMore: true,
  page: 0,
  processingRows: new Set(),
  aiCategorizing: false,
  autoplayMode: false,

  // UI state
  isTableActive: false,
  activeRowIndex: null,

  // Actions
  updateExpense: () => undefined,
  handleTogglePersonal: () => undefined,
  updateExpenseCategory: () => undefined,
  handleAcceptSuggestion: () => undefined,
  handleAiCategorization: () => undefined,
  toggleAutoplay: () => undefined,
  handleClearCategory: () => undefined,
  fetchProgress: () => undefined,

  // Refs
  loadMoreRef: null,
  containerRef: null,
  tableRef: null,
};

export const SpreadsheetContext = createContext(spreadsheetInitialValues);

export const SpreadsheetContextProvider = ({ children, project }) => {
  // Zustand store integration
  const {
    expenses: expenseStore,
    setProject: setStoreProject,
    setExpenses: setStoreExpenses,
    updateExpense: updateStoreExpense,
    markPageRequested,
    isPageRequested,
    setPageLoading,
    isPageLoading,
    getExpensesForPage,
    hasCompletePageData,
    getExpenseByIndex,
    clearAll: clearStore,
  } = useExpenseStore();

  // Store functions already available above

  const [categories, setCategories] = useState([]);
  const [progress, setProgress] = useState({
    percentage: 0,
    isComplete: false,
    total_count: 0,
    categorized_count: 0,
    uncategorized_count: 0,
  });

  // Convert Zustand store to array format for compatibility
  const expenses = Object.values(expenseStore).sort(
    (a, b) => (a._rowIndex || 0) - (b._rowIndex || 0)
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [processingRows, setProcessingRows] = useState(new Set());
  const [aiCategorizing, setAiCategorizing] = useState(false);
  const [autoplayMode, setAutoplayMode] = useState(false);
  const autoplayModeRef = useRef(false);
  const aiModeRef = useRef('categorize'); // current AI mode for autoplay continuations
  const viewRef = useRef('all'); // current tab/view for AI scoping
  const sortRef = useRef(''); // current sort so AI picks rows in view order
  const [isTableActive, setIsTableActive] = useState(false);
  const [activeRowIndex, setActiveRowIndex] = useState(null);

  // View/search filtering (backend-driven for virtual scroll)
  const [view, setView] = useState('all'); // 'all' | 'business' | 'personal' | 'removed'
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  // Sort order for the expense list. '' = default (date asc); 'amount_desc' /
  // 'amount_asc' for clicking the Amount header.
  const [sort, setSort] = useState('');
  useEffect(() => {
    sortRef.current = sort;
  }, [sort]);
  // Show only uncategorized rows when true.
  const [uncatOnly, setUncatOnly] = useState(false);
  // Show only miscategorized rows (category lean conflicts with lane) when true.
  const [miscatOnly, setMiscatOnly] = useState(false);
  // Show only rows never triaged into a lane (is_personal IS NULL) when true.
  const [unsetOnly, setUnsetOnly] = useState(false);
  // Show only rows with a pending personal suggestion when true.
  const [suggestedOnly, setSuggestedOnly] = useState(false);
  const [search, setSearch] = useState('');
  // Which field the search box matches: 'description' (default) | 'source' | 'category'.
  const [searchField, setSearchField] = useState('description');
  const [filteredCount, setFilteredCount] = useState(0);

  // Pending propagation confirmation (manual category / personal toggle)
  // Shape: { field: 'category'|'personal', categoryId?, isPersonal?, sourceId, similar: [expense] }
  const [pendingPropagation, setPendingPropagation] = useState(null);

  // Bumped to force the virtual-scroll table to remount + refetch (e.g. after a
  // remove/restore changes which rows belong in the current view).
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [previousActiveRowIndex, setPreviousActiveRowIndex] = useState(null);
  const [isVirtualScrollActive, setIsVirtualScrollActive] = useState(false);

  const loadMoreRef = useRef(null);
  const containerRef = useRef(null);
  const tableRef = useRef(null);
  const loadingRef = useRef(false);
  const LIMIT = 50;

  // AI Categorization state (now handled directly in context)
  // Removed useAiCategorizer hook dependency since backend now handles expense selection

  // Fetch project progress
  const fetchProgress = useCallback(async () => {
    if (!project?.id) return;

    try {
      const API_URL = import.meta.env.VITE_API_URL || '';
      const response = await fetch(
        `${API_URL}/api/projects/${project.id}/progress`
      );
      if (response.ok) {
        const data = await response.json();
        setProgress({
          percentage: Math.round(data.percentage),
          isComplete: data.is_complete,
          total_count: data.total_count || 0,
          categorized_count: data.categorized_count || 0,
          uncategorized_count: data.uncategorized_count || 0,
          pending_personal_count: data.pending_personal_count || 0,
          pending_suggested_count: data.pending_suggested_count || 0,
        });
      }
    } catch (error) {
      console.error('Failed to fetch progress:', error);
    }
  }, [project?.id]);

  // Build view/search query params shared by expenses + count fetches
  const filterParams = useCallback(() => {
    const params = new URLSearchParams();
    if (view && view !== 'all') params.set('view', view);
    if (search) {
      params.set('search', search);
      if (searchField !== 'description') params.set('searchField', searchField);
    }
    if (sort) params.set('sort', sort);
    if (uncatOnly) params.set('uncat', '1');
    if (miscatOnly) params.set('miscat', '1');
    if (unsetOnly) params.set('unset', '1');
    if (suggestedOnly) params.set('suggested', '1');
    return params.toString();
  }, [view, search, searchField, sort, uncatOnly, miscatOnly, unsetOnly, suggestedOnly]);

  // Fetch the filtered expense count (sizes the virtual scrollbar)
  const fetchFilteredCount = useCallback(async () => {
    if (!project?.id) return;
    try {
      const API_URL = import.meta.env.VITE_API_URL || '';
      const qs = filterParams();
      const response = await fetch(
        `${API_URL}/api/projects/${project.id}/expenses/count${qs ? `?${qs}` : ''}`
      );
      if (response.ok) {
        const data = await response.json();
        setFilteredCount(data.count || 0);
      }
    } catch (error) {
      console.error('Failed to fetch count:', error);
    }
  }, [project?.id, filterParams]);

  // Update expense function (handles both category and personal)
  const updateExpense = useCallback(
    async (expenseId, updates) => {
      // Optimistic update using Zustand store
      updateStoreExpense(expenseId, updates);

      try {
        const API_URL = import.meta.env.VITE_API_URL || '';
        const response = await fetch(`${API_URL}/api/expenses/${expenseId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updates),
        });

        if (!response.ok) {
          throw new Error(`Failed to update expense: ${response.status}`);
        }

        // Get the actual values from API response
        const responseData = await response.json();

        // Update Zustand store with API response values (not request values)
        const mainUpdates = {};
        if (responseData.accepted_category_id !== undefined)
          mainUpdates.accepted_category_id = responseData.accepted_category_id;
        if (responseData.suggested_category_id !== undefined)
          mainUpdates.suggested_category_id =
            responseData.suggested_category_id;
        if (responseData.is_personal !== undefined)
          mainUpdates.is_personal = responseData.is_personal;

        updateStoreExpense(expenseId, mainUpdates);

        // Refresh progress after categorization changes
        fetchProgress();
      } catch (error) {
        console.error('Failed to update expense:', error);
      }
    },
    [fetchProgress, updateStoreExpense]
  );

  // After a manual edit, look up other same-description rows and, if any exist,
  // open the confirmation modal so the user can opt in to propagation.
  const checkAndOfferPropagation = useCallback(
    async (sourceExpense, field, payload) => {
      if (!project?.id || !sourceExpense?.id) return;
      try {
        const API_URL = import.meta.env.VITE_API_URL || '';
        const response = await fetch(
          `${API_URL}/api/projects/${project.id}/similar?expenseId=${sourceExpense.id}&field=${field}`
        );
        if (!response.ok) return;
        const similar = await response.json();
        if (Array.isArray(similar) && similar.length > 0) {
          setPendingPropagation({
            field,
            ...payload,
            sourceId: sourceExpense.id,
            similar,
          });
        }
      } catch (error) {
        console.error('Failed to check similar expenses:', error);
      }
    },
    [project?.id]
  );

  // User confirmed propagation -> bulk apply to the similar rows.
  const confirmPropagation = useCallback(async () => {
    const pending = pendingPropagation;
    if (!pending) return;
    setPendingPropagation(null);
    const ids = pending.similar.map(e => e.id);
    if (ids.length === 0) return;

    // Optimistic store update
    const optimistic = {};
    if (pending.field === 'category')
      optimistic.accepted_category_id = pending.categoryId;
    if (pending.field === 'personal')
      optimistic.is_personal = pending.isPersonal;
    ids.forEach(id => updateStoreExpense(id, optimistic));

    try {
      const API_URL = import.meta.env.VITE_API_URL || '';
      const body = { ids };
      if (pending.field === 'category')
        body.accepted_category_id = pending.categoryId;
      if (pending.field === 'personal') body.is_personal = pending.isPersonal;
      const response = await fetch(
        `${API_URL}/api/projects/${project.id}/bulk-update`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );
      if (response.ok) {
        const data = await response.json();
        toast.success(
          `${data.updated} similar item${data.updated === 1 ? '' : 's'} updated`
        );
      }
      fetchProgress();
      await fetchFilteredCount();
      // If propagating personal makes the rows fall out of the current view,
      // refresh so they disappear instead of lingering greyed.
      const fallsOut =
        (pending.field === 'personal' &&
          view === 'business' &&
          pending.isPersonal) ||
        (pending.field === 'personal' &&
          view === 'personal' &&
          !pending.isPersonal);
      if (fallsOut) setRefreshNonce(n => n + 1);
    } catch (error) {
      console.error('Bulk update failed:', error);
      toast.error('Failed to update similar items');
    }
  }, [
    pendingPropagation,
    project?.id,
    updateStoreExpense,
    fetchProgress,
    fetchFilteredCount,
    view,
  ]);

  // User declined propagation -> keep only the single explicit edit.
  const cancelPropagation = useCallback(() => {
    setPendingPropagation(null);
  }, []);

  // Scroll active row into view helper (works for both regular and virtual scroll)
  const scrollActiveRowIntoView = useCallback(
    rowIndex => {
      const row = document.querySelector(`[data-row-index="${rowIndex}"]`);
      if (!row) return;

      // Find the scrollable container for this row
      let scrollContainer = row.closest('.overflow-auto');
      if (!scrollContainer) {
        scrollContainer = containerRef.current; // Fallback to regular table container
      }

      if (scrollContainer) {
        const containerRect = scrollContainer.getBoundingClientRect();
        const rowRect = row.getBoundingClientRect();

        // Scroll if row is out of view (above or below)
        if (
          rowRect.bottom > containerRect.bottom ||
          rowRect.top < containerRect.top
        ) {
          // Compute the target scroll from the row's CURRENT position relative
          // to the container, plus the container's current scroll. Do NOT use
          // row.offsetTop: in the virtual list rows sit inside absolutely-
          // positioned page containers, so offsetTop is the row's position
          // within its page (0..pageHeight), not its true list position — which
          // made scrolling jump back toward page 1 at page boundaries.
          const containerHeight = scrollContainer.clientHeight;
          const rowHeight = rowRect.height;
          const delta =
            rowRect.top - containerRect.top - containerHeight / 2 + rowHeight / 2;
          scrollContainer.scrollTop = Math.max(
            0,
            scrollContainer.scrollTop + delta
          );
        }
      }
    },
    [containerRef]
  );

  // Set active row with proper tab index management
  const setActiveRowWithTabIndex = useCallback(
    newIndex => {
      // For virtual scroll, use pure React state and programmatic focus
      if (isVirtualScrollActive) {
        setPreviousActiveRowIndex(activeRowIndex);
        setActiveRowIndex(newIndex);

        // Move browser focus to the new active row
        if (newIndex !== null) {
          // Use setTimeout to ensure DOM has updated with new active state
          setTimeout(() => {
            const newRow = document.querySelector(
              `[data-row-index="${newIndex}"]`
            );
            if (newRow) {
              newRow.focus();
            }
          }, 0);
        }
        return;
      }

      // For regular table, use DOM queries (original behavior)
      // Clear tabIndex from previous active row
      if (previousActiveRowIndex !== null) {
        const prevRow = document.querySelector(
          `[data-row-index="${previousActiveRowIndex}"]`
        );
        if (prevRow) {
          prevRow.setAttribute('tabindex', '1');
        }
      }

      // Set tabIndex on new active row and focus it
      if (newIndex !== null) {
        const newRow = document.querySelector(`[data-row-index="${newIndex}"]`);
        if (newRow) {
          newRow.setAttribute('tabindex', '0');
          newRow.focus();
        }
      }

      setPreviousActiveRowIndex(activeRowIndex);
      setActiveRowIndex(newIndex);
    },
    [activeRowIndex, previousActiveRowIndex, isVirtualScrollActive]
  );

  // Auto-advance to next row helper
  const advanceToNextRow = useCallback(
    () => {
      // Advance from the currently active row to the next one. Use
      // activeRowIndex directly (the true row index in the current view) rather
      // than expenses.findIndex, which only reflects loaded rows and breaks once
      // you've scrolled past the first page of the virtual list.
      if (activeRowIndex === null) return;
      const total = filteredCount || expenses.length;
      if (activeRowIndex < total - 1) {
        const newIndex = activeRowIndex + 1;
        setActiveRowWithTabIndex(newIndex);
        scrollActiveRowIntoView(newIndex);
      }
    },
    [
      activeRowIndex,
      filteredCount,
      expenses.length,
      setActiveRowWithTabIndex,
      scrollActiveRowIntoView,
    ]
  );

  const handleTogglePersonal = useCallback(
    async expense => {
      const turningOn = !expense.is_personal;
      await updateExpense(expense.id, { is_personal: turningOn });

      // If the toggle makes the row no longer belong to the current view, refresh
      // the list so it disappears (rather than just being greyed). This happens on
      // the Business tab when marking personal ON, and on the Personal tab when
      // marking personal OFF.
      const fallsOutOfView =
        (view === 'business' && turningOn) ||
        (view === 'personal' && !turningOn);
      if (fallsOutOfView) {
        await fetchFilteredCount();
        setRefreshNonce(n => n + 1);
      } else {
        advanceToNextRow();
      }

      // Offer to propagate only when marking personal ON (off is a single edit).
      if (turningOn) {
        checkAndOfferPropagation(expense, 'personal', { isPersonal: true });
      }
    },
    [
      updateExpense,
      advanceToNextRow,
      checkAndOfferPropagation,
      view,
      fetchFilteredCount,
    ]
  );

  // Convenience functions for specific actions.
  // offerPropagation: when true (manual dropdown / hotkey), after the single
  // edit we check for same-description rows and prompt the user to propagate.
  const updateExpenseCategory = useCallback(
    async (expenseId, categoryId, offerPropagation = false) => {
      const updates = { accepted_category_id: categoryId || null };
      // Setting a real category dismisses any pending personal suggestion
      // (mirrors the backend), so the amber highlight clears immediately.
      if (categoryId) updates.suggested_is_personal = false;
      await updateExpense(expenseId, updates);
      if (offerPropagation && categoryId) {
        const sourceExpense = expenses.find(e => e.id === expenseId) || {
          id: expenseId,
        };
        checkAndOfferPropagation(sourceExpense, 'category', { categoryId });
      }
    },
    [updateExpense, expenses, checkAndOfferPropagation]
  );

  const handleAcceptSuggestion = useCallback(
    expense => {
      // Accept the AI suggestion if there's one to accept; either way advance to
      // the next row so you can mash 'A' through already-accepted rows.
      if (expense.suggested_category_id && !expense.accepted_category_id) {
        updateExpenseCategory(expense.id, expense.suggested_category_id);
      }
      advanceToNextRow();
    },
    [updateExpenseCategory, advanceToNextRow]
  );

  // Remove (soft-delete) or restore an expense. The row vanishes from the
  // current view and the filtered count is refreshed so the scrollbar resizes.
  const handleToggleRemoved = useCallback(
    async (expense, removed) => {
      try {
        const API_URL = import.meta.env.VITE_API_URL || '';
        const response = await fetch(`${API_URL}/api/expenses/${expense.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deleted: removed }),
        });
        if (!response.ok) throw new Error(`Failed: ${response.status}`);
        // Refresh: resize scrollbar, update progress, and remount the virtual
        // table so it refetches (the store clear happens in the table's layout
        // effect, keyed on refreshNonce — clearing here would leave the table's
        // internal page cache stale and render a blank list).
        await fetchFilteredCount();
        fetchProgress();
        setRefreshNonce(n => n + 1);
        toast.success(removed ? 'Item removed' : 'Item restored');
      } catch (error) {
        console.error('Failed to toggle removed:', error);
        toast.error('Failed to update item');
      }
    },
    [fetchFilteredCount, fetchProgress]
  );

  // Approve a single AI personal suggestion: confirm is_personal = suggested
  // value (clears the suggestion). Reuses handleTogglePersonal semantics for
  // the common case (suggestion is 'personal').
  const approvePersonalSuggestion = useCallback(
    async expense => {
      const target = expense.suggested_is_personal === true;
      // Optimistic: set personal + clear suggestion.
      updateStoreExpense(expense.id, {
        is_personal: target,
        suggested_is_personal: null,
      });
      try {
        const API_URL = import.meta.env.VITE_API_URL || '';
        await fetch(`${API_URL}/api/expenses/${expense.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_personal: target }),
        });
        fetchProgress();
        // Offer to propagate to other same-description rows, same as a manual
        // personal toggle (only when confirming personal = ON).
        if (target) {
          checkAndOfferPropagation(expense, 'personal', { isPersonal: true });
        }
        // If the row now leaves the current view, refresh the list.
        if (
          (viewRef.current === 'business' && target) ||
          (viewRef.current === 'personal' && !target)
        ) {
          await fetchFilteredCount();
          setRefreshNonce(n => n + 1);
        }
      } catch (error) {
        console.error('Approve personal failed:', error);
      }
    },
    [updateStoreExpense, fetchProgress, fetchFilteredCount, checkAndOfferPropagation]
  );

  // Dismiss a single AI personal suggestion = confirm business (FALSE), so it
  // isn't reconsidered by AI Set Personal. Doesn't change is_personal.
  const dismissPersonalSuggestion = useCallback(
    async expense => {
      updateStoreExpense(expense.id, { suggested_is_personal: false });
      try {
        const API_URL = import.meta.env.VITE_API_URL || '';
        await fetch(`${API_URL}/api/expenses/${expense.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clear_personal_suggestion: true }),
        });
        fetchProgress();
      } catch (error) {
        console.error('Dismiss personal failed:', error);
      }
    },
    [updateStoreExpense, fetchProgress]
  );

  // Bulk approve or dismiss ALL pending personal suggestions in the project.
  const resolveAllPersonal = useCallback(
    async action => {
      if (!project?.id) return;
      try {
        const API_URL = import.meta.env.VITE_API_URL || '';
        const response = await fetch(
          `${API_URL}/api/projects/${project.id}/resolve-personal`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action }),
          }
        );
        if (!response.ok) throw new Error(`status ${response.status}`);
        const data = await response.json();
        toast.success(
          `${action === 'approve' ? 'Approved' : 'Dismissed'} ${data.affected} suggestion${data.affected === 1 ? '' : 's'}`
        );
        await fetchFilteredCount();
        fetchProgress();
        setRefreshNonce(n => n + 1);
      } catch (error) {
        console.error('Resolve all personal failed:', error);
        toast.error('Failed to resolve suggestions');
      }
    },
    [project?.id, fetchFilteredCount, fetchProgress]
  );

  // Bulk approve or dismiss ALL pending category suggestions in the project.
  const resolveAllCategory = useCallback(
    async action => {
      if (!project?.id) return;
      try {
        const API_URL = import.meta.env.VITE_API_URL || '';
        const response = await fetch(
          `${API_URL}/api/projects/${project.id}/resolve-category`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action }),
          }
        );
        if (!response.ok) throw new Error(`status ${response.status}`);
        const data = await response.json();
        toast.success(
          `${action === 'approve' ? 'Accepted' : 'Dismissed'} ${data.affected} suggestion${data.affected === 1 ? '' : 's'}`
        );
        await fetchFilteredCount();
        fetchProgress();
        setRefreshNonce(n => n + 1);
      } catch (error) {
        console.error('Resolve all category failed:', error);
        toast.error('Failed to resolve suggestions');
      }
    },
    [project?.id, fetchFilteredCount, fetchProgress]
  );

  const handleClearCategory = expense => {
    // Send API call with -1 values (backend converts to NULL and returns null)
    updateExpense(expense.id, {
      accepted_category_id: -1,
      suggested_category_id: -1,
    });
  };

  // Handle autoplay continuation logic
  const handleAutoplayContinuation = suggestions => {
    const currentAutoplayMode = autoplayModeRef.current;

    // Check current autoplay mode using ref (not stale state)
    if (!currentAutoplayMode) {
      return false;
    }

    if (suggestions.length > 0) {
      handleAiCategorization();
      return true; // Continue processing
    } else {
      setAutoplayMode(false);
      autoplayModeRef.current = false; // Keep ref in sync
      return false;
    }
  };

  // Toggle continuous (autoplay) mode for the given AI mode.
  const toggleAutoplay = (mode = aiModeRef.current) => {
    aiModeRef.current = mode;
    setAutoplayMode(prev => {
      const newValue = !prev;
      autoplayModeRef.current = newValue; // Keep ref in sync
      return newValue;
    });
  };

  // AI Categorization function - now with job tracking
  const handleAiCategorization = async (mode = aiModeRef.current) => {
    if (!project?.id) {
      console.warn('Cannot run AI: no project selected');
      return;
    }
    aiModeRef.current = mode;
    setAiCategorizing(true);

    try {
      const API_URL = import.meta.env.VITE_API_URL || '';
      const response = await fetch(
        `${API_URL}/api/projects/${project.id}/ai-categorize`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode, view: viewRef.current, sort: sortRef.current }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`${response.status} - ${errorText}`);
      }

      const jobResult = await response.json();
      if (!jobResult.job_id) {
        throw new Error('Backend did not return a job_id');
      }

      const selectedExpenses = jobResult.selected_expenses || [];
      setProcessingRows(new Set(selectedExpenses));
      pollJobStatus(jobResult.job_id);
    } catch (error) {
      console.error('AI job failed:', error);
      toast.error(`AI failed: ${error.message}`);
      setAiCategorizing(false);
    }
  };
  // Poll job status until completion
  const pollJobStatus = async jobId => {
    const API_URL = import.meta.env.VITE_API_URL || '';
    let attempts = 0;
    const maxAttempts = 300; // Poll for up to 5 minutes (1s intervals)

    const poll = async () => {
      try {
        const response = await fetch(`${API_URL}/api/jobs/${jobId}`);

        if (!response.ok) {
          throw new Error(`Job status check failed: ${response.status}`);
        }

        const jobStatus = await response.json();

        if (jobStatus.status === 'completed') {
          // Job completed successfully
          handleJobCompletion(jobStatus);
          return;
        } else if (jobStatus.status === 'failed') {
          // Job failed
          throw new Error(jobStatus.error || 'AI categorization job failed');
        } else if (
          jobStatus.status === 'processing' ||
          jobStatus.status === 'queued'
        ) {
          // Job still in progress
          attempts++;
          if (attempts < maxAttempts) {
            setTimeout(poll, 1000); // Poll every 1 second
          } else {
            throw new Error('Job timeout: AI categorization took too long');
          }
        }
      } catch (error) {
        console.error('Job polling failed:', error);
        toast.error(`Job polling failed: ${error.message}`);
        setProcessingRows(new Set());
        setAiCategorizing(false);
      }
    };

    // Start polling
    poll();
  };

  // Handle job completion
  const handleJobCompletion = jobStatus => {
    const isPersonalMode = jobStatus.mode === 'set_personal';
    const results = isPersonalMode
      ? jobStatus.classifications || []
      : jobStatus.categorizations || [];

    if (results.length === 0) {
      toast.info(jobStatus.message || 'Nothing left for AI to process');
    } else if (isPersonalMode) {
      // Apply staged business/personal suggestions.
      results.forEach(c => {
        updateStoreExpense(c.rowId, { suggested_is_personal: c.isPersonal });
      });
      const personalCount = results.filter(c => c.isPersonal).length;
      toast.success(
        `AI flagged ${personalCount} of ${results.length} as personal`
      );
      fetchProgress();
    } else {
      // Apply staged category suggestions.
      results.forEach(suggestion => {
        updateStoreExpense(suggestion.rowId, {
          suggested_category_id: suggestion.categoryId,
          ai_confidence: suggestion.confidence,
          ai_reasoning: suggestion.reasoning,
        });
      });
      toast.success(
        jobStatus.message || `AI categorized ${results.length} expenses`
      );
      fetchProgress();
    }

    // Continue in autoplay if there was work this round.
    if (handleAutoplayContinuation(results)) {
      return; // keep processing state; next round starts
    }

    setProcessingRows(new Set());
    setAiCategorizing(false);
  };

  // Load expenses function
  const loadExpenses = async (pageNum = 0, isInitial = false) => {
    // Prevent multiple simultaneous requests
    if (loadingRef.current) return;

    loadingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const API_URL = import.meta.env.VITE_API_URL || '';
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

      // Store expenses in Zustand store
      const actualPage = pageNum + 1; // Convert to 1-based page
      setStoreExpenses(newExpenses, actualPage, LIMIT);
      markPageRequested(actualPage, `expenses?offset=${offset}&limit=${LIMIT}`);

      // Always update page to reflect what we just loaded
      setPage(pageNum);
    } catch (err) {
      console.error('Failed to fetch expenses:', err);
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

    // Reset state - both local and Zustand store
    setStoreProject(project.id);
    setPage(0);
    setHasMore(true);
    setError(null);
    setProcessingRows(new Set());
    loadingRef.current = false;

    // Load categories only. The virtual scroll table fetches its own expense
    // pages (filter-aware) via requestExpensePage; prefetching expenses here
    // would race with and clobber the filtered data in the store.
    const loadInitialData = async () => {
      try {
        const API_URL = import.meta.env.VITE_API_URL || '';
        const categoriesResponse = await fetch(`${API_URL}/api/categories`, {
          signal: abortController.signal,
        });
        if (abortController.signal.aborted) return;
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
  }, [project?.id]);

  // Fetch progress when project changes or expenses are updated
  useEffect(() => {
    if (project?.id) {
      fetchProgress();
    }
  }, [fetchProgress, project?.id, expenses.length]);

  // When the view/search filter changes, refetch the filtered count so the
  // scrollbar resizes. The store is cleared by ExpenseTableVirtual in a
  // layout effect (which runs before the virtual scroll re-requests pages),
  // avoiding a race where clearing here would wipe freshly-fetched rows.
  useEffect(() => {
    if (!project?.id) return;
    fetchFilteredCount();
  }, [project?.id, view, search, searchField, sort, uncatOnly, miscatOnly, unsetOnly, suggestedOnly]);

  // Handle autoplay mode activation - only trigger initial round
  useEffect(() => {
    autoplayModeRef.current = autoplayMode; // Keep ref in sync
    if (autoplayMode && !aiCategorizing) {
      handleAiCategorization();
    }
  }, [autoplayMode]); // Only depend on autoplayMode, not aiCategorizing

  // Keyboard navigation handlers
  useEffect(() => {
    const handleKeyDown = e => {
      // Ignore when typing in a form field or inside an open dialog (e.g. the
      // category modal), otherwise category hotkeys hijack normal typing.
      const t = e.target;
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable ||
          (typeof t.closest === 'function' && t.closest('[role="dialog"]')))
      ) {
        return;
      }

      if (!isTableActive) return;

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          if (activeRowIndex === null) {
            // No active row, select first row
            setActiveRowWithTabIndex(0);
          } else if (activeRowIndex > 0) {
            // Move up one row
            const upIndex = activeRowIndex - 1;
            setActiveRowWithTabIndex(upIndex);
            setTimeout(() => scrollActiveRowIntoView(upIndex), 0);
          }
          // If activeRowIndex === 0, do nothing (stay on first row)
          break;
        case 'ArrowDown': {
          e.preventDefault();
          // Bound by the filtered TOTAL, not expenses.length: in the virtual
          // list `expenses` only holds loaded rows, so using its length stopped
          // ArrowDown at the first page boundary.
          const total = filteredCount || expenses.length;
          if (activeRowIndex === null) {
            setActiveRowWithTabIndex(0);
          } else if (activeRowIndex < total - 1) {
            const downIndex = activeRowIndex + 1;
            setActiveRowWithTabIndex(downIndex);
            setTimeout(() => scrollActiveRowIntoView(downIndex), 0);
          }
          break;
        }
        case 'Escape':
          setIsTableActive(false);
          setActiveRowWithTabIndex(null);
          break;
        case 'a':
        case 'A':
          if (activeRowIndex !== null) {
            e.preventDefault();
            const currentExpense =
              getExpenseByIndex(activeRowIndex) || expenses[activeRowIndex];
            if (currentExpense) {
              handleAcceptSuggestion(currentExpense);
            }
          }
          break;
        case 'p':
        case 'P':
          if (activeRowIndex !== null) {
            e.preventDefault();
            const currentExpense =
              getExpenseByIndex(activeRowIndex) || expenses[activeRowIndex];
            if (currentExpense) {
              handleTogglePersonal(currentExpense);
            }
          }
          break;
        default:
          // Check for category hotkeys
          if (activeRowIndex !== null && e.key.length === 1) {
            const hotkey = e.key.toUpperCase();
            const category = categories.find(cat => cat.hotkey === hotkey);
            if (category) {
              e.preventDefault();
              const currentExpense =
                getExpenseByIndex(activeRowIndex) || expenses[activeRowIndex];
              if (currentExpense) {
                updateExpenseCategory(currentExpense.id, category.id, true);
              }
            }
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    isTableActive,
    activeRowIndex,
    expenses,
    filteredCount,
    handleAcceptSuggestion,
    handleTogglePersonal,
    scrollActiveRowIntoView,
    setActiveRowWithTabIndex,
    getExpenseByIndex,
    updateExpenseCategory,
    categories,
  ]);

  const value = {
    // Data state
    expenses,
    categories,
    progress,

    // Loading states
    loading,
    error,
    hasMore,
    page,
    processingRows,
    aiCategorizing,
    autoplayMode,

    // UI state
    isTableActive,
    activeRowIndex,
    isVirtualScrollActive,
    setIsTableActive,
    setActiveRowIndex,
    setIsVirtualScrollActive,

    // View/search filtering
    view,
    setView,
    search,
    setSearch,
    searchField,
    setSearchField,
    sort,
    setSort,
    uncatOnly,
    setUncatOnly,
    miscatOnly,
    setMiscatOnly,
    unsetOnly,
    setUnsetOnly,
    suggestedOnly,
    setSuggestedOnly,
    filteredCount,
    fetchFilteredCount,
    filterParams,
    refreshNonce,

    // Propagation confirmation
    pendingPropagation,
    confirmPropagation,
    cancelPropagation,

    // Store reset (used by the table to clear cache on filter change)
    clearStore,
    setStoreProject,

    // Actions
    updateExpense,
    handleTogglePersonal,
    updateExpenseCategory,
    handleAcceptSuggestion,
    handleAiCategorization,
    toggleAutoplay,
    handleClearCategory,
    handleToggleRemoved,
    approvePersonalSuggestion,
    dismissPersonalSuggestion,
    resolveAllPersonal,
    resolveAllCategory,
    fetchProgress,
    loadExpenses,
    setActiveRowWithTabIndex,

    // Refs
    loadMoreRef,
    containerRef,
    tableRef,
    loadingRef,

    // Constants
    LIMIT,

    // Zustand store functions for virtual scroll
    getExpensesForPage,
    hasCompletePageData,
    getExpenseByIndex,
    isPageRequested,
    setPageLoading,
    isPageLoading,
    markPageRequested,
    setStoreExpenses,
  };

  return (
    <SpreadsheetContext.Provider value={value}>
      {children}
    </SpreadsheetContext.Provider>
  );
};
