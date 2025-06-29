import { useEffect, useContext } from 'react';
import { TableCell, TableHead, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
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

  const downloadCSV = () => {
    const csvContent = [
      ['Category', 'Total'],
      ...totals.map(total => [total.category_name, total.total_amount]),
      ['Total', totals.reduce((sum, total) => sum + total.total_amount, 0)]
    ].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'totals.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
        <tbody>
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
          <TableRow className="border-t-2 border-black">
            <TableCell className="font-bold text-black">Total</TableCell>
            <TableCell className={`text-right font-mono font-bold text-black`}>
              {formatAmount(totals.reduce((sum, total) => sum + total.total_amount, 0))}
            </TableCell>
          </TableRow>
        </tbody>
      </table>
    </div>
  );
};

export default TotalsView;
