/**
 * IMMUTABLE LAW: Expired items are those whose expiry date is earlier or is in the current month
 * 
 * This function determines if a stock item is expired based on the immutable law:
 * - Items from previous years are expired
 * - Items from previous months in current year are expired  
 * - Items from current month are expired (realistic for pharmaceuticals)
 * - Items from future months are NOT expired
 * 
 * @param expiryDate - The expiry date string (YYYY-MM-DD format)
 * @returns boolean - true if expired, false if not expired
 */
export const isExpired = (expiryDate: string): boolean => {
  const now = new Date();
  const expiry = new Date(expiryDate);
  
  return (
    expiry.getFullYear() < now.getFullYear() ||
    (expiry.getFullYear() === now.getFullYear() && expiry.getMonth() < now.getMonth()) ||
    (expiry.getFullYear() === now.getFullYear() && expiry.getMonth() === now.getMonth())
  );
};

/**
 * Get the number of days until expiry
 * @param expiryDate - The expiry date string
 * @returns number - Days until expiry (negative if expired)
 */
export const getDaysUntilExpiry = (expiryDate: string): number => {
  const now = new Date();
  const expiry = new Date(expiryDate);
  return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
};

/**
 * Get the risk level based on days until expiry
 * @param expiryDate - The expiry date string
 * @returns string - Risk level: 'expired', 'critical', 'high', 'low', 'very-low'
 */
export const getRiskLevel = (expiryDate: string): string => {
  if (isExpired(expiryDate)) return 'expired';
  
  const daysToExpiry = getDaysUntilExpiry(expiryDate);
  
  if (daysToExpiry <= 30) return 'critical';      // 0-30 days
  if (daysToExpiry <= 60) return 'high';          // 31-60 days
  if (daysToExpiry <= 180) return 'low';          // 61-180 days
  return 'very-low';                              // 181+ days
};

/**
 * Filter items to get only expired items
 * @param items - Array of stock items
 * @returns Array of expired items only
 */
export const getExpiredItems = <T extends { expiry_date: string }>(items: T[]): T[] => {
  return items.filter(item => isExpired(item.expiry_date));
};

/**
 * Filter items to get only non-expired items
 * @param items - Array of stock items
 * @returns Array of non-expired items only
 */
export const getNonExpiredItems = <T extends { expiry_date: string }>(items: T[]): T[] => {
  return items.filter(item => !isExpired(item.expiry_date));
}; 