export const formatUGX = (amount: number): string => {
  return new Intl.NumberFormat('en-UG', {
    style: 'currency',
    currency: 'UGX',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export const calculateROI = (investment: number, returns: number): number => {
  return ((returns - investment) / investment) * 100;
};

export const calculateInventoryTurnover = (costOfGoodsSold: number, averageInventory: number): number => {
  return costOfGoodsSold / averageInventory;
};

export const calculateDaysSalesOfInventory = (inventoryTurnover: number): number => {
  return 365 / inventoryTurnover;
};

export const calculateWastageRate = (expiredValue: number, totalValue: number): number => {
  return (expiredValue / totalValue) * 100;
};

export const calculateEfficiencyScore = (
  wastageRate: number,
  inventoryTurnover: number,
  daysSalesOfInventory: number
): number => {
  // Normalize metrics to 0-100 scale
  const normalizedWastage = Math.max(0, 100 - wastageRate);
  const normalizedTurnover = Math.min(100, inventoryTurnover * 10);
  const normalizedDSI = Math.max(0, 100 - (daysSalesOfInventory / 365) * 100);

  // Weighted average
  return (normalizedWastage * 0.4 + normalizedTurnover * 0.3 + normalizedDSI * 0.3);
}; 