export interface BackoffOptions {
  baseDelayMs?: number;
  maxDelayMs?: number;
  maxAttempts?: number;
  random?: () => number;
}

export interface RetryDecision {
  shouldRetry: boolean;
  delayMs: number;
}

const DEFAULTS = {
  baseDelayMs: 1_000,
  maxDelayMs: 5 * 60 * 1_000,
  maxAttempts: 8,
};

/**
 * Bounded exponential backoff with jitter. `attempts` is the number of failed
 * attempts so far, so the first failure schedules the base delay.
 */
export function retryDecision(attempts: number, options: BackoffOptions = {}): RetryDecision {
  const baseDelayMs = options.baseDelayMs ?? DEFAULTS.baseDelayMs;
  const maxDelayMs = options.maxDelayMs ?? DEFAULTS.maxDelayMs;
  const maxAttempts = options.maxAttempts ?? DEFAULTS.maxAttempts;
  if (attempts >= maxAttempts) return { shouldRetry: false, delayMs: 0 };

  const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, attempts));
  const random = options.random ?? Math.random;
  const jitter = 0.5 + Math.min(1, Math.max(0, random())) * 0.5;
  return {
    shouldRetry: true,
    delayMs: Math.max(0, Math.round(exponential * jitter)),
  };
}

export function retryAt(now: number, delayMs: number): string {
  return new Date(now + delayMs).toISOString();
}

export function isRetryDue(retryAtValue: string | null, now: number): boolean {
  if (!retryAtValue) return true;
  const timestamp = Date.parse(retryAtValue);
  return !Number.isFinite(timestamp) || timestamp <= now;
}
