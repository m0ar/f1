import type { RaceDataResponse, RaceResult, CacheDiffResponse } from "@/types";
import { fetchAllRaceData, fetchLiveRaceData as serverFetchLiveRaceData, fetchCacheDiff as serverFetchCacheDiff } from "@/server/openf1";

export interface FetchOptions {
  /** DEV: Simulate a live race for testing */
  simulateLive?: boolean;
}

export async function fetchRaceResults(
  year: number,
  options: FetchOptions = {}
): Promise<RaceDataResponse> {
  return fetchAllRaceData({ data: { year, simulateLive: options.simulateLive } });
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
