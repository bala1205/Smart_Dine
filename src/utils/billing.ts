export interface BillBreakdown {
  subtotal: number;
  gstPercent: number;
  gstAmount: number;
  serviceChargePercent: number;
  serviceChargeAmount: number;
  grandTotal: number;
}

export function calculateBill(
  subtotal: number,
  gstPercent: number,
  serviceChargePercent: number
): BillBreakdown {
  const safeSubtotal = Math.max(0, Number(subtotal) || 0);
  const gstP = Math.max(0, Math.min(100, Number(gstPercent) || 0));
  const scP = Math.max(0, Math.min(100, Number(serviceChargePercent) || 0));
  const gstAmount = Math.round(safeSubtotal * (gstP / 100) * 100) / 100;
  const serviceChargeAmount = Math.round(safeSubtotal * (scP / 100) * 100) / 100;
  const grandTotal = Math.round((safeSubtotal + gstAmount + serviceChargeAmount) * 100) / 100;
  return {
    subtotal: Math.round(safeSubtotal * 100) / 100,
    gstPercent: gstP,
    gstAmount,
    serviceChargePercent: scP,
    serviceChargeAmount,
    grandTotal,
  };
}

export interface SplitEqualShare {
  shareSubtotal: number;
  shareGst: number;
  shareServiceCharge: number;
  shareTotal: number;
}

export function splitEqually(bill: BillBreakdown, people: number): SplitEqualShare {
  const n = Math.max(1, Math.floor(Number(people) || 1));
  return {
    shareSubtotal: Math.round((bill.subtotal / n) * 100) / 100,
    shareGst: Math.round((bill.gstAmount / n) * 100) / 100,
    shareServiceCharge: Math.round((bill.serviceChargeAmount / n) * 100) / 100,
    shareTotal: Math.round((bill.grandTotal / n) * 100) / 100,
  };
}

export interface ItemSplitResult {
  customerA: BillBreakdown;
  customerB: BillBreakdown;
  totalCheck: BillBreakdown;
}

export function splitByItems(
  items: { price: number; quantity: number }[],
  selectedIds: Set<string> | boolean[],
  gstPercent: number,
  serviceChargePercent: number
): ItemSplitResult {
  // items with selected flag
  let subA = 0;
  let subB = 0;
  items.forEach((it, idx) => {
    const amount = (Number(it.price) || 0) * (Number(it.quantity) || 0);
    const isSelected = Array.isArray(selectedIds)
      ? Boolean((selectedIds as boolean[])[idx])
      : (selectedIds as Set<string>).has(String(idx));
    if (isSelected) subA += amount;
    else subB += amount;
  });
  return {
    customerA: calculateBill(subA, gstPercent, serviceChargePercent),
    customerB: calculateBill(subB, gstPercent, serviceChargePercent),
    totalCheck: calculateBill(subA + subB, gstPercent, serviceChargePercent),
  };
}
