import React, { createContext, useContext, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client'

// Export the StockItem type so other components can use it
export interface StockItem {
  id: string;
  product_name: string;
  branch_id: string;
  branch_name?: string;
  expiry_date: string;
  quantity: number;
  unit_price: number;
  status: string;
}

interface StockAdjusterContextType {
  openAdjustModal: (item: StockItem) => void;
  closeAdjustModal: () => void;
  isModalOpen: boolean;
  selectedItem: StockItem | null;
}

const StockAdjusterContext = createContext<StockAdjusterContextType | undefined>(undefined);

export const StockAdjusterProvider = ({ children }: { children: ReactNode }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null);

  const openAdjustModal = (item: StockItem) => {
    setSelectedItem(item);
    setModalOpen(true);
  };

  const closeAdjustModal = () => {
    setModalOpen(false);
    setSelectedItem(null);
  };

  return (
    <StockAdjusterContext.Provider value={{ 
      openAdjustModal, 
      closeAdjustModal, 
      isModalOpen: modalOpen, 
      selectedItem 
    }}>
      {children}
    </StockAdjusterContext.Provider>
  );
};

export const useStockAdjuster = () => {
  const ctx = useContext(StockAdjusterContext);
  if (!ctx) throw new Error('useStockAdjuster must be used within a StockAdjusterProvider');
  return ctx;
}; 