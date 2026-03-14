export function parseDateRange(searchParams: URLSearchParams) {
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;

  const fromIso =
    fromDate && !Number.isNaN(fromDate.getTime())
      ? fromDate.toISOString()
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const toIso = toDate && !Number.isNaN(toDate.getTime()) ? toDate.toISOString() : new Date().toISOString();

  return { fromIso, toIso };
}

export function parseLimit(searchParams: URLSearchParams, fallback: number, max: number) {
  const raw = searchParams.get("limit");
  const n = raw ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

