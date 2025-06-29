import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

const totalsInitialValues = {
  totals: [],
  loadingTotals: false,
  error: null,
  fetchTotals: () => undefined,
};

export const TotalsContext = createContext(totalsInitialValues);

export const TotalsContextProvider = ({ children, project }) => {
  const [totals, setTotals] = useState([]);
  const [loadingTotals, setLoadingTotals] = useState(false);
  const [error, setError] = useState(null);

  // Fetch project totals
  const fetchTotals = useCallback(async () => {
    if (!project?.id) return;
    
    setLoadingTotals(true);
    setError(null);
    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";
      const response = await fetch(`${API_URL}/api/projects/${project.id}/totals`);
      if (response.ok) {
        const data = await response.json();
        setTotals(data || []);
      } else {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      console.error("Failed to fetch totals:", error);
      setError(`Failed to load totals: ${error.message}`);
    } finally {
      setLoadingTotals(false);
    }
  }, [project?.id]);

  const value = {
    totals,
    loadingTotals,
    error,
    fetchTotals,
  };

  return (
    <TotalsContext.Provider value={value}>
      {children}
    </TotalsContext.Provider>
  );
};

export const useTotalsContext = () => {
  const context = useContext(TotalsContext);
  if (!context) {
    throw new Error('useTotalsContext must be used within a TotalsContextProvider');
  }
  return context;
};
