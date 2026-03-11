import { useState, useEffect, useRef, useCallback } from "react";
import type { RaceDataResponse, RaceResult } from "@/types";
import { fetchLiveRaceResult } from "@/lib/api";

const POLL_INTERVAL_MS = 10_000; // 10 seconds

export interface UseLiveRaceDataOptions {
  /** Whether polling is enabled (default: true) */
  enabled?: boolean;
  /** DEV: Simulate a live race for testing */
  simulateLive?: boolean;
}

export interface UseLiveRaceDataResult {
  /** The race data with live updates merged in */
  data: RaceDataResponse;
  /** Whether a live race is currently being polled */
  isLive: boolean;
  /** Whether a poll is currently in progress */
  isPolling: boolean;
  /** Timestamp of last successful poll */
  lastUpdated: Date | null;
}

/**
 * Hook that polls for live race data during an ongoing race.
 * Only polls when there's a liveSession in the initial data.
 * Merges live updates into the race results without refetching historical data.
 */
export function useLiveRaceData(
  initialData: RaceDataResponse,
  year: number,
  options: UseLiveRaceDataOptions = {}
): UseLiveRaceDataResult {
  const { enabled = true, simulateLive = false } = options;

  const [data, setData] = useState<RaceDataResponse>(initialData);
  const [isPolling, setIsPolling] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Track if component is mounted to avoid state updates after unmount
  const mountedRef = useRef(true);
  // Track the interval ID for cleanup
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Update data when initialData changes (e.g., year change)
  useEffect(() => {
    setData(initialData);
    setLastUpdated(null);
  }, [initialData]);

  const pollLiveData = useCallback(async () => {
    const liveSession = data.liveSession;
    if (!liveSession || !mountedRef.current) return;

    setIsPolling(true);
    try {
      const liveResult = await fetchLiveRaceResult(liveSession.sessionKey, year, { simulateLive });

      if (!mountedRef.current) return;

      if (liveResult) {
        // Debug: log the top 3 driver positions
        console.log(
          "[useLiveRaceData] Received update, top 3:",
          liveResult.driverStandings.slice(0, 3).map((d) => `${d.position}:${d.driver_name_acronym}`)
        );

        setData((prev) => {
          // Find and replace the live session result, or append if not found
          const existingIndex = prev.results.findIndex(
            (r) => r.sessionKey === liveResult.sessionKey
          );

          let newResults: RaceResult[];
          if (existingIndex >= 0) {
            // Replace existing result
            newResults = [...prev.results];
            newResults[existingIndex] = liveResult;
          } else {
            // Append new result (race just started)
            newResults = [...prev.results, liveResult];
          }

          return {
            ...prev,
            results: newResults,
          };
        });
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error("Error polling live race data:", error);
    } finally {
      if (mountedRef.current) {
        setIsPolling(false);
      }
    }
  }, [data.liveSession, year, simulateLive]);

  // Set up polling interval
  useEffect(() => {
    mountedRef.current = true;

    const hasLiveSession = !!data.liveSession;
    const shouldPoll = enabled && hasLiveSession;

    if (shouldPoll) {
      // Initial poll
      pollLiveData();

      // Set up interval
      intervalRef.current = setInterval(pollLiveData, POLL_INTERVAL_MS);
    }

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, data.liveSession?.sessionKey, pollLiveData]);

  // Pause polling when tab is not visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab hidden - stop polling
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      } else if (enabled && data.liveSession) {
        // Tab visible again - resume polling
        pollLiveData();
        intervalRef.current = setInterval(pollLiveData, POLL_INTERVAL_MS);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, data.liveSession, pollLiveData]);

  return {
    data,
    isLive: !!data.liveSession,
    isPolling,
    lastUpdated,
  };
}
