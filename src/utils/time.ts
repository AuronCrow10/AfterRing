// src/utils/time.ts
export function getCurrentMonthStart(date: Date): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  return new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
}

export function diffInSecondsCeil(start: Date, end: Date): number {
  const diffMs = end.getTime() - start.getTime();
  if (diffMs <= 0) {
    return 0;
  }
  return Math.ceil(diffMs / 1000);
}
