const MINUTE_MS = 60_000;
const EPOCH_SECONDS_MIN = 1_000_000_000;
const EPOCH_MILLISECONDS_MIN = 1_000_000_000_000;

/**
 * Older web snapshots stored project activity as minutes before the current
 * time. New snapshots use absolute epoch milliseconds.
 */
export function normalizeProjectLast(value: unknown, now = Date.now()): number {
  let timestamp = value;
  if (typeof timestamp === 'string' && timestamp.trim()) {
    const numeric = Number(timestamp);
    timestamp = Number.isFinite(numeric) ? numeric : Date.parse(timestamp);
  }
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0) return 0;
  if (timestamp >= EPOCH_MILLISECONDS_MIN) return timestamp;
  if (timestamp >= EPOCH_SECONDS_MIN) return timestamp * 1_000;
  return now - timestamp * MINUTE_MS;
}
