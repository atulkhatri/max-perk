// Locale-aware formatting helpers. Kept separate from strings.ts so copy
// stays declarative while formatting stays testable.

export function formatCAD(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits,
  }).format(value);
}

export function formatPoints(points: number): string {
  return new Intl.NumberFormat('en-CA', { maximumFractionDigits: 0 }).format(Math.round(points));
}

export function formatCpp(cpp: number): string {
  return `${cpp.toFixed(2)}¢`;
}

export function formatMultiplier(rate: number): string {
  return `${Number(rate.toFixed(2))}×`;
}
