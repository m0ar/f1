import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useCallback } from "react";
import { fetchRaceResults, fetchLiveRaceResult } from "@/lib/api";
import type { RaceDataResponse, RaceResult } from "@/types";

const POLL_INTERVAL_MS = 10_000; // 10 seconds

// Query key factory for race data
export const raceDataKeys = {
  all: ["raceData"] as const,
  year: (year: number, simulateLive?: boolean) =>
    [...raceDataKeys.all, year, simulateLive ?? false] as const,
};

interface UseRaceDataOptions {
  /** DEV: Simulate a live race for testing */
  simulateLive?: boolean;
}

/**
 * Hook to fetch and cache race data for a year.
 * Uses TanStack Query for automatic caching and deduplication.
 */
export function useRaceData(year: number, options: UseRaceDataOptions = {}) {
  const { simulateLive = false } = options;

  return useQuery({
    queryKey: raceDataKeys.year(year, simulateLive),
    queryFn: () => fetchRaceResults(year, { simulateLive }),
    staleTime: 30_000, // Consider fresh for 30 seconds
    gcTime: 5 * 60_000, // Keep in cache for 5 minutes
  });
}

interface UseLiveRaceDataOptions {
  /** Whether polling is enabled */
  enabled?: boolean;
  /** DEV: Simulate a live race for testing */
  simulateLive?: boolean;
}

/**
 * Hook that polls for live race data during an ongoing race.
 * Merges live updates into the cached race data.
 */
export function useLiveRaceData(
  year: number,
  options: UseLiveRaceDataOptions = {}
) {
  const { enabled = true, simulateLive = false } = options;
  const queryClient = useQueryClient();

  // Get the current race data from cache
  const {
    data: raceData,
    isLoading,
    error,
  } = useRaceData(year, { simulateLive });

  const liveSession = raceData?.liveSession;
  const shouldPoll = enabled && !!liveSession;

  // Track polling state
  const isPollingRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastUpdatedRef = useRef<Date | null>(null);

  const pollLiveData = useCallback(async () => {
    if (!liveSession || isPollingRef.current) return;

    isPollingRef.current = true;
    try {
      const liveResult = await fetchLiveRaceResult(
        liveSession.sessionKey,
        year,
        { simulateLive }
      );

      if (liveResult) {
        // Update the cached data with the live result
        queryClient.setQueryData<RaceDataResponse>(
          raceDataKeys.year(year, simulateLive),
          (oldData) => {
            if (!oldData) return oldData;

            // Find and replace the live session result, or append if not found
            const existingIndex = oldData.results.findIndex(
              (r) => r.sessionKey === liveResult.sessionKey
            );

            let newResults: RaceResult[];
            if (existingIndex >= 0) {
              newResults = [...oldData.results];
              newResults[existingIndex] = liveResult;
            } else {
              newResults = [...oldData.results, liveResult];
            }

            return {
              ...oldData,
              results: newResults,
            };
          }
        );
        lastUpdatedRef.current = new Date();
      }
    } catch (error) {
      console.error("Error polling live race data:", error);
    } finally {
      isPollingRef.current = false;
    }
  }, [liveSession, year, simulateLive, queryClient]);

  // Set up polling interval
  useEffect(() => {
    if (!shouldPoll) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Initial poll
    pollLiveData();

    // Set up interval
    intervalRef.current = setInterval(pollLiveData, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [shouldPoll, pollLiveData]);

  // Pause polling when tab is not visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      } else if (shouldPoll) {
        pollLiveData();
        intervalRef.current = setInterval(pollLiveData, POLL_INTERVAL_MS);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [shouldPoll, pollLiveData]);

  return {
    data: raceData,
    isLoading,
    error,
    isLive: !!liveSession,
    lastUpdated: lastUpdatedRef.current,
  };
}
