import { useEffect, useContext } from 'react';
import { TableCell, TableHead, TableRow } from '@/components/ui/table';
import { TotalsContext } from '../contexts/TotalsContext';

const formatAmount = amount => {
  if (amount === null || amount === undefined) return '';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount);
};

const sectionTotal = rows =>
  rows.reduce((sum, r) => sum + (r.total_amount || 0), 0);

const TotalsSection = ({ title, rows }) => {
  if (!rows || rows.length === 0) return null;
  return (
    <>
      <TableRow className="bg-muted/50">
        <TableCell className="font-semibold uppercase text-xs tracking-wide text-muted-foreground">
          {title}
        </TableCell>
        <TableCell />
      </TableRow>
      {rows.map((total, index) => (
        <TableRow key={`${title}-${index}`}>
          <TableCell className="font-medium pl-6">
            {total.category_name}
          </TableCell>
          <TableCell
            className={`text-right font-mono ${
              total.total_amount >= 0 ? 'text-green-600' : 'text-red-600'
            }`}
          >
            {formatAmount(total.total_amount)}
          </TableCell>
        </TableRow>
      ))}
      <TableRow className="border-t">
        <TableCell className="font-semibold pl-6">{title} Total</TableCell>
        <TableCell className="text-right font-mono font-semibold">
          {formatAmount(sectionTotal(rows))}
        </TableCell>
      </TableRow>
    </>
  );
};

const TotalsView = () => {
  const { business, personal, loadingTotals, fetchTotals } =
    useContext(TotalsContext);

  useEffect(() => {
    fetchTotals();
  }, [fetchTotals]);

  if (loadingTotals) {
    return (
      <div className="flex items-center justify-center p-8">
        <span className="text-muted-foreground">Loading totals...</span>
      </div>
    );
  }

  if (
    (!business || business.length === 0) &&
    (!personal || personal.length === 0)
  ) {
    return (
      <div className="flex items-center justify-center p-8">
        <span className="text-muted-foreground">
          No categorized expenses found
        </span>
      </div>
    );
  }

  const grandTotal = sectionTotal(business) + sectionTotal(personal);

  return (
    <div className="overflow-auto h-[calc(100vh-162px)]">
      <table className="w-full caption-bottom text-sm">
        <thead className="[&_tr]:border-b sticky top-0 z-10">
          <TableRow className="bg-background border-b">
            <TableHead className="bg-background">Category</TableHead>
            <TableHead className="bg-background text-right">Total</TableHead>
          </TableRow>
        </thead>
        <tbody>
          <TotalsSection title="Business" rows={business} />
          <TotalsSection title="Personal" rows={personal} />
          <TableRow className="border-t-2 border-black">
            <TableCell className="font-bold text-black">Grand Total</TableCell>
            <TableCell className="text-right font-mono font-bold text-black">
              {formatAmount(grandTotal)}
            </TableCell>
          </TableRow>
        </tbody>
      </table>
    </div>
  );
};

export default TotalsView;
