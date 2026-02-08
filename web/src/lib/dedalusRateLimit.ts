/**
 * Shared 429 backoff for Dedalus API. All Dedalus calls (detection, overlay relevance, details, etc.)
 * share the same rate limit; when any call gets 429 we back off for all.
 */

let last429At = 0;

export const DEDALUS_BACKOFF_MS = 45_000; // 45s backoff after any 429

export function setDedalus429(): void {
  last429At = Date.now();
}

export function isDedalusBackoff(backoffMs = DEDALUS_BACKOFF_MS): boolean {
  return last429At > 0 && Date.now() - last429At < backoffMs;
}
