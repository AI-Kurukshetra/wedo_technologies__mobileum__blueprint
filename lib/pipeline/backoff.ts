export function computeNextAttemptAt(params: {
  now: Date;
  attemptCount: number;
  baseMs?: number;
  maxMs?: number;
}) {
  const baseMs = Math.max(250, Math.floor(params.baseMs ?? 2_000));
  const maxMs = Math.max(baseMs, Math.floor(params.maxMs ?? 15 * 60_000));
  const attempt = Math.max(0, Math.floor(params.attemptCount));

  const exp = Math.min(20, attempt);
  const raw = Math.min(maxMs, baseMs * 2 ** exp);
  const jitter = Math.floor(raw * (0.15 * (Math.random() * 2 - 1))); // +/-15%
  const delayMs = Math.max(baseMs, Math.min(maxMs, raw + jitter));

  return new Date(params.now.getTime() + delayMs);
}

