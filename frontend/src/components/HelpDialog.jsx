import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const HelpDialog = ({ isOpen, onClose }) => {
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    if (isOpen) {
      fetchCategories();
    }
  }, [isOpen]);

  const fetchCategories = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";
      const response = await fetch(`${API_URL}/api/categories`);
      if (response.ok) {
        const data = await response.json();
        setCategories(data || []);
      }
    } catch (error) {
      console.error("Failed to fetch categories:", error);
    }
  };

  const formatCategoryName = (name, hotkey) => {
    if (!hotkey) return name;
    
    // Try to highlight the hotkey in the name
    const index = name.toUpperCase().indexOf(hotkey.toUpperCase());
    if (index === -1) {
      return `${name} [${hotkey}]`;
    }
    
    return (
      <>
        {name.slice(0, index)}
        <span className="font-bold">[{name.slice(index, index + 1)}]</span>
        {name.slice(index + 1)}
      </>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>
            Available shortcuts when interacting with the table
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 items-center gap-4">
            <div className="font-mono bg-gray-100 px-2 py-1 rounded text-sm">
              ↑ / ↓
            </div>
            <div className="text-sm">
              Navigate between rows
            </div>
          </div>
          <div className="grid grid-cols-2 items-center gap-4">
            <div className="font-mono bg-gray-100 px-2 py-1 rounded text-sm">
              A
            </div>
            <div className="text-sm">
              Accept AI suggestion
            </div>
          </div>
          <div className="grid grid-cols-2 items-center gap-4">
            <div className="font-mono bg-gray-100 px-2 py-1 rounded text-sm">
              P
            </div>
            <div className="text-sm">
              Toggle Personal expense
            </div>
          </div>
          <div className="grid grid-cols-2 items-center gap-4">
            <div className="font-mono bg-gray-100 px-2 py-1 rounded text-sm">
              Esc
            </div>
            <div className="text-sm">
              Deactivate table
            </div>
          </div>
          
          {/* Category Hotkeys */}
          {categories.filter(cat => cat.hotkey).length > 0 && (
            <>
              <div className="col-span-2 border-t pt-4">
                <h4 className="font-medium text-sm mb-2">Category Hotkeys</h4>
              </div>
              {categories
                .filter(cat => cat.hotkey)
                .sort((a, b) => a.hotkey.localeCompare(b.hotkey))
                .map(category => (
                  <div key={category.id} className="grid grid-cols-2 items-center gap-4">
                    <div className="font-mono bg-gray-100 px-2 py-1 rounded text-sm">
                      {category.hotkey}
                    </div>
                    <div className="text-sm">
                      {formatCategoryName(category.name, category.hotkey)}
                    </div>
                  </div>
                ))
              }
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default HelpDialog;
