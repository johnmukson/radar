type Item = {
  itemId: string;
  expiryDate: string; // ISO format
  quantity: number;
};

export type Assignment = {
  dispenserId: string;
  itemId: string;
  expiryMonth: string;
  quantity: number;
};

export type ExpiredItem = Item & { reason: string };

export type AssignItemsFairlyWithExpiryResult = {
  assignments: Assignment[];
  expiredItemsReport: ExpiredItem[];
};

export function assignItemsFairlyWithExpiry(
  items: Item[],
  dispensers: string[],
  currentDate: string
): AssignItemsFairlyWithExpiryResult {
  if (dispensers.length === 0) {
    return { assignments: [], expiredItemsReport: items.map(i => ({ ...i, reason: 'No dispensers available' })) };
  }

  const today = new Date(currentDate);
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();

  const validItems: Item[] = [];
  const expiredItemsReport: ExpiredItem[] = [];

  // Step 1: Exclude items expiring this month or with <30 days left
  for (const item of items) {
    const expiry = new Date(item.expiryDate);
    const daysLeft = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (
      expiry.getFullYear() === currentYear &&
      expiry.getMonth() === currentMonth
    ) {
      expiredItemsReport.push({ ...item, reason: 'Expires this month' });
    } else if (daysLeft < 30) {
      expiredItemsReport.push({ ...item, reason: 'Less than 30 days shelf life' });
    } else {
      validItems.push(item);
    }
  }

  // Step 2: Group by expiry month, sort months and items
  const itemsByMonth: Record<string, Item[]> = {};
  for (const item of validItems) {
    const expiryMonth = item.expiryDate.slice(0, 7); // "YYYY-MM"
    if (!itemsByMonth[expiryMonth]) itemsByMonth[expiryMonth] = [];
    itemsByMonth[expiryMonth].push(item);
  }

  const sortedMonths = Object.keys(itemsByMonth).sort();

  // Step 3: Distribute quantities fairly across dispensers
  const assignments: Assignment[] = [];
  const burden: Record<string, number> = {};
  dispensers.forEach(d => (burden[d] = 0));

  for (const month of sortedMonths) {
    // Sort items in this month by expiry date (soonest first)
    const monthItems = itemsByMonth[month].sort(
      (a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime()
    );

    for (const item of monthItems) {
      let qtyLeft = item.quantity;
      while (qtyLeft > 0) {
        // Find least burdened dispenser(s)
        const minBurden = Math.min(...dispensers.map(d => burden[d]));
        const leastBurdened = dispensers.filter(d => burden[d] === minBurden);

        // If more dispensers than qtyLeft, only use as many as needed
        const assignCount = Math.min(leastBurdened.length, qtyLeft);
        const perDispenser = Math.ceil(qtyLeft / assignCount);

        for (let i = 0; i < assignCount; i++) {
          const d = leastBurdened[i];
          const assignQty = Math.min(perDispenser, qtyLeft);
          assignments.push({
            dispenserId: d,
            itemId: item.itemId,
            expiryMonth: month,
            quantity: assignQty,
          });
          burden[d] += assignQty;
          qtyLeft -= assignQty;
          if (qtyLeft <= 0) break;
        }
      }
    }
  }

  return { assignments, expiredItemsReport };
} 