import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

const totalsInitialValues = {
  business: [],
  personal: [],
  loadingTotals: false,
  error: null,
  fetchTotals: () => undefined,
};

export const TotalsContext = createContext(totalsInitialValues);

export const TotalsContextProvider = ({ children, project }) => {
  const [business, setBusiness] = useState([]);
  const [personal, setPersonal] = useState([]);
  const [loadingTotals, setLoadingTotals] = useState(false);
  const [error, setError] = useState(null);

  // Fetch project totals
  const fetchTotals = useCallback(async () => {
    if (!project?.id) return;

    setLoadingTotals(true);
    setError(null);
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';
      const response = await fetch(
        `${API_URL}/api/projects/${project.id}/totals`
      );
      if (response.ok) {
        const data = await response.json();
        setBusiness(data.business || []);
        setPersonal(data.personal || []);
      } else {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      console.error('Failed to fetch totals:', error);
      setError(`Failed to load totals: ${error.message}`);
    } finally {
      setLoadingTotals(false);
    }
  }, [project?.id]);

  const value = {
    business,
    personal,
    loadingTotals,
    error,
    fetchTotals,
  };

  return (
    <TotalsContext.Provider value={value}>{children}</TotalsContext.Provider>
  );
};
