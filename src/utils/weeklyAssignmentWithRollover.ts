type Product = {
  id: string;
  name: string;
  expiryDate: string; // ISO
  quantity: number;
};

export type WeeklyAssignment = {
  month: string; // YYYY-MM
  week: number;
  products: Product[];
};

export type RolloverNotification = {
  fromMonth: string;
  fromWeek: number;
  toMonth: string;
  toWeek: number;
  productIds: string[];
};

export function assignWeeklyWithRollover(
  products: Product[],
  startDate: string // ISO, first day of current month
): { assignments: WeeklyAssignment[]; rollovers: RolloverNotification[] } {
  // Sort products by expiry (soonest first)
  const sorted = [...products].sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
  const assignments: WeeklyAssignment[] = [];
  const rollovers: RolloverNotification[] = [];

  let week = 1;
  let month = startDate.slice(0, 7); // YYYY-MM
  let idx = 0;
  let current = [] as Product[];
  const rolloverProducts: Product[] = [];

  while (idx < sorted.length) {
    current = [];
    for (let i = 0; i < 7 && idx < sorted.length; i++, idx++) {
      current.push(sorted[idx]);
    }
    assignments.push({ month, week, products: current });
    if (current.length < 7) break; // No more products
    // Prepare for next week
    week++;
    // If week > 4, roll to next month
    if (week > 4) {
      // Rollover notification
      if (idx < sorted.length) {
        rollovers.push({
          fromMonth: month,
          fromWeek: 4,
          toMonth: nextMonth(month),
          toWeek: 1,
          productIds: sorted.slice(idx).map(p => p.id),
        });
      }
      week = 1;
      month = nextMonth(month);
    }
  }
  return { assignments, rollovers };
}

function nextMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m, 1); // m is 0-indexed, so this gives us the next month
  return d.toISOString().slice(0, 7);
} 