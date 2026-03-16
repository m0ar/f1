import type { RaceDataResponse, RaceResult, CacheDiffResponse } from "@/types";
import { fetchAllRaceData, fetchLiveRaceData as serverFetchLiveRaceData, fetchCacheDiff as serverFetchCacheDiff } from "@/server/openf1";

// In-flight request deduplication (prevents duplicate concurrent requests)
const pendingRequests = new Map<string, Promise<RaceDataResponse>>();

export interface FetchOptions {
  /** DEV: Simulate a live race for testing */
  simulateLive?: boolean;
}

export async function fetchRaceResults(
  year: number,
  options: FetchOptions = {}
): Promise<RaceDataResponse> {
  const { simulateLive } = options;
  const cacheKey = `${year}:${simulateLive ?? false}`;

  // Deduplicate concurrent requests for the same year/mode
  const pending = pendingRequests.get(cacheKey);
  if (pending) {
    return pending;
  }

  // Single server call that handles all the batching and rate limiting
  const request = fetchAllRaceData({ data: { year, simulateLive } }).then((response) => {
    pendingRequests.delete(cacheKey);
    return response;
  }).catch((error) => {
    pendingRequests.delete(cacheKey);
    throw error;
  });

  pendingRequests.set(cacheKey, request);
  return request;
}

// Fetch live race data for a single session (used for polling during ongoing races)
export async function fetchLiveRaceResult(
  sessionKey: number,
  year: number,
  options: FetchOptions = {}
): Promise<RaceResult | null> {
  const { simulateLive } = options;
  return serverFetchLiveRaceData({ data: { sessionKey, year, simulateLive } });
}

// Fetch cache diff data (compares KV cache with fresh API data, read-only)
export async function fetchCacheDiffData(
  year: number,
  sessionKeys?: number[]
): Promise<CacheDiffResponse> {
  return serverFetchCacheDiff({ data: { year, sessionKeys } });
}
