// In-memory token bucket per key. v0.1 only — single VPS, single process.
// v0.2 will swap this for a Redis-backed bucket once we have multiple workers.
type Bucket = { tokens: number; lastRefill: number };

const buckets = new Map<string, Bucket>();

// Try to consume one token from the bucket identified by `key`.
// `capacity` is the burst size; `refillPerMinute` is the steady-state rate.
// For "N requests per minute", call with capacity = refillPerMinute = N.
export function consume(key: string, capacity: number, refillPerMinute: number): boolean {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: capacity, lastRefill: now };
    buckets.set(key, bucket);
  }

  const elapsedMin = (now - bucket.lastRefill) / 60_000;
  bucket.tokens = Math.min(capacity, bucket.tokens + elapsedMin * refillPerMinute);
  bucket.lastRefill = now;

  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}

// For tests / debugging.
export function _resetBuckets(): void {
  buckets.clear();
}
