import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

/**
 * Books tab state: list of years from /api/books/years, the selected year
 * ('' = all years) and a cache of fetched views keyed by `${name}|${year}`.
 *
 * Views used by the Books page. The equity rollforward is always fetched for
 * all years so the page can show every year and highlight the selected one.
 */
export const BOOKS_VIEWS = [
  'checks',
  'pl_summary',
  'pl',
  'contributions',
  'distributions',
  'balance_sheet',
  'cash_balances',
  'cash_tie',
];

export const ALL_YEARS = '';

const API_URL = import.meta.env.VITE_API_URL || '';

export const viewUrl = (name, year, format) => {
  const params = new URLSearchParams();
  if (year !== ALL_YEARS && year !== null && year !== undefined) {
    params.set('year', String(year));
  }
  if (format) params.set('format', format);
  const qs = params.toString();
  return `${API_URL}/api/books/views/${name}${qs ? `?${qs}` : ''}`;
};

export const exportUrl = year => {
  const params = new URLSearchParams();
  if (year !== ALL_YEARS && year !== null && year !== undefined) {
    params.set('year', String(year));
  }
  const qs = params.toString();
  return `${API_URL}/api/books/export${qs ? `?${qs}` : ''}`;
};

const booksInitialValues = {
  years: [],
  year: ALL_YEARS,
  setYear: () => undefined,
  views: {},
  rollforward: null,
  loading: false,
  error: null,
  refresh: () => undefined,
};

export const BooksContext = createContext(booksInitialValues);

const fetchJson = async url => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status} (${url})`);
  }
  return response.json();
};

export const BooksContextProvider = ({ children }) => {
  const [years, setYears] = useState([]);
  const [year, setYear] = useState(null); // null until years are loaded
  const [views, setViews] = useState({});
  const [rollforward, setRollforward] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [nonce, setNonce] = useState(0);

  // Years: default to the latest one.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchJson(`${API_URL}/api/books/years`);
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        setYears(list);
        setYear(list.length > 0 ? list[list.length - 1] : ALL_YEARS);
      } catch (err) {
        console.error('Failed to fetch books years:', err);
        if (!cancelled) {
          setError(`Failed to load years: ${err.message}`);
          setYear(ALL_YEARS);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  // Every view for the selected year, plus the rollforward for all years.
  useEffect(() => {
    if (year === null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [rf, ...rest] = await Promise.all([
          fetchJson(viewUrl('equity_rollforward', ALL_YEARS)),
          ...BOOKS_VIEWS.map(name => fetchJson(viewUrl(name, year))),
        ]);
        if (cancelled) return;
        const next = {};
        BOOKS_VIEWS.forEach((name, i) => {
          next[name] = rest[i];
        });
        setRollforward(rf);
        setViews(next);
      } catch (err) {
        console.error('Failed to fetch books views:', err);
        if (!cancelled) setError(`Failed to load books: ${err.message}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [year, nonce]);

  const refresh = useCallback(() => setNonce(n => n + 1), []);

  const value = useMemo(
    () => ({
      years,
      year: year === null ? ALL_YEARS : year,
      setYear,
      views,
      rollforward,
      loading,
      error,
      refresh,
    }),
    [years, year, views, rollforward, loading, error, refresh]
  );

  return (
    <BooksContext.Provider value={value}>{children}</BooksContext.Provider>
  );
};

export const useBooks = () => useContext(BooksContext);
