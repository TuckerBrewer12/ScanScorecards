/** Appends a rolling average field to each row. Null values in the window are skipped. */
export function withRollingAverage<T>(
  data: T[],
  getValue: (row: T) => number | null,
  w = 5,
): (T & { rolling_avg: number | null })[] {
  return data.map((row, i) => {
    const slice = data.slice(Math.max(0, i - w + 1), i + 1);
    const valid = slice.map(getValue).filter((v): v is number => v != null);
    return {
      ...row,
      rolling_avg: valid.length
        ? Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10
        : null,
    };
  });
}

/** Simple array average. Returns null for empty arrays. */
export function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Compares the last n rows to the preceding n rows for a numeric metric.
 *  Returns (last avg - prev avg); positive means the metric went up. */
export function trendDelta<T>(
  rows: T[],
  getValue: (row: T) => number,
  n = 5,
): number | null {
  if (rows.length < n + 1) return null;
  const last = rows.slice(-n);
  const prev = rows.slice(-n * 2, -n);
  if (!prev.length) return null;
  const avg = (arr: T[]) => arr.reduce((s, r) => s + getValue(r), 0) / arr.length;
  return avg(last) - avg(prev);
}
