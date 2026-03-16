// ============================================================================
// Gantt Date Utilities
// ============================================================================

/**
 * Parse a YYYY-MM-DD string into a Date at midnight UTC.
 */
export function parseDate(str: string): Date {
  const [datePart] = str.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Number of calendar days between two dates (inclusive).
 */
export function daysBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)) + 1);
}

/**
 * Number of days from a reference date to a target date.
 */
export function daysFromRef(ref: Date, target: Date): number {
  const ms = target.getTime() - ref.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

/**
 * Format a date as "Mon D" (e.g., "Apr 1").
 */
export function formatShortDate(d: Date): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/**
 * Format a date as "D Mon 'YY" (e.g., "1 Apr '26").
 */
export function formatMediumDate(d: Date): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const year = String(d.getUTCFullYear()).slice(2);
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} '${year}`;
}

/**
 * Generate an array of dates between start and end (inclusive), one per day.
 */
export function generateDateRange(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  const current = new Date(start);
  while (current <= end) {
    dates.push(new Date(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Check if a date is the first day of its month.
 */
export function isFirstOfMonth(d: Date): boolean {
  return d.getUTCDate() === 1;
}

/**
 * Check if a date is a Monday (for week markers).
 */
export function isMonday(d: Date): boolean {
  return d.getUTCDay() === 1;
}

/**
 * Check if a date is today.
 */
export function isToday(d: Date): boolean {
  const now = new Date();
  return (
    d.getUTCFullYear() === now.getFullYear() &&
    d.getUTCMonth() === now.getMonth() &&
    d.getUTCDate() === now.getDate()
  );
}