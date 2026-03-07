import type { RaceDataResponse } from "@/types";
import { fetchAllRaceData } from "@/server/openf1";

// In-flight request deduplication (prevents duplicate concurrent requests)
const pendingRequests = new Map<number, Promise<RaceDataResponse>>();

export async function fetchRaceResults(year: number): Promise<RaceDataResponse> {
  // Deduplicate concurrent requests for the same year
  const pending = pendingRequests.get(year);
  if (pending) {
    return pending;
  }

  // Single server call that handles all the batching and rate limiting
  const request = fetchAllRaceData({ data: { year } }).then((response) => {
    pendingRequests.delete(year);
    return response;
  }).catch((error) => {
    pendingRequests.delete(year);
    throw error;
  });

  pendingRequests.set(year, request);
  return request;
}
