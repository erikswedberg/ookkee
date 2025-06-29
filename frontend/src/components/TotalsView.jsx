import { useEffect, useContext } from 'react';
import { TableCell, TableHead, TableRow } from "@/components/ui/table";
import { TotalsContext } from '../contexts/TotalsContext';

const TotalsView = () => {
  const { totals, loadingTotals, fetchTotals } = useContext(TotalsContext);
  
  useEffect(() => {
    fetchTotals();
  }, [fetchTotals]);
  
  const formatAmount = amount => {
    if (amount === null || amount === undefined) return "";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  if (loadingTotals) {
    return (
      <div className="flex items-center justify-center p-8">
        <span className="text-muted-foreground">Loading totals...</span>
      </div>
    );
  }

  if (totals.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <span className="text-muted-foreground">No categorized expenses found</span>
      </div>
    );
  }

  return (
    <div className="overflow-auto h-[calc(100vh-250px)]">
      <table className="w-full caption-bottom text-sm">
        <thead className="[&_tr]:border-b sticky top-0 z-10">
          <TableRow className="bg-background border-b">
            <TableHead className="bg-background">Category</TableHead>
            <TableHead className="bg-background text-right">Total</TableHead>
          </TableRow>
        </thead>
        <tbody className="[&_tr:last-child]:border-0">
          {totals.map((total, index) => (
            <TableRow key={index}>
              <TableCell className="font-medium">{total.category_name}</TableCell>
              <TableCell className={`text-right font-mono ${
                total.total_amount >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {formatAmount(total.total_amount)}
              </TableCell>
            </TableRow>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TotalsView;
