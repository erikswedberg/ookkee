import { useContext } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { SpreadsheetContext } from '../contexts/SpreadsheetContext';

// Confirmation modal shown after a manual category or personal edit, listing
// other same-description rows the change can propagate to. Opt-in only.
const PropagationModal = () => {
  const {
    pendingPropagation,
    confirmPropagation,
    cancelPropagation,
    categories,
  } = useContext(SpreadsheetContext);

  const open = !!pendingPropagation;
  const similar = pendingPropagation?.similar || [];

  let targetLabel = '';
  if (pendingPropagation?.field === 'category') {
    const cat = categories.find(c => c.id === pendingPropagation.categoryId);
    targetLabel = `"${cat?.name || 'this category'}"`;
  } else if (pendingPropagation?.field === 'personal') {
    targetLabel = 'Personal';
  }

  return (
    <Dialog
      open={open}
      onOpenChange={o => {
        if (!o) cancelPropagation();
      }}
    >
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Apply to similar items?</DialogTitle>
          <DialogDescription>
            These {similar.length} other item{similar.length === 1 ? '' : 's'}{' '}
            have the same description and will be set to {targetLabel}.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[40vh] overflow-y-auto border rounded-md divide-y">
          {similar.map(e => (
            <div
              key={e.id}
              className="flex items-center justify-between px-3 py-2 text-sm"
            >
              <span className="truncate mr-3">{e.description}</span>
              <span className="font-mono text-muted-foreground whitespace-nowrap">
                {e.amount != null
                  ? new Intl.NumberFormat('en-US', {
                      style: 'currency',
                      currency: 'USD',
                    }).format(e.amount)
                  : ''}
              </span>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={cancelPropagation}>
            No Thanks
          </Button>
          <Button onClick={confirmPropagation}>Yes, Proceed</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PropagationModal;
