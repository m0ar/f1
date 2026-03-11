import { env } from "cloudflare:workers";
import type { RaceResult, ApiDriver, RaceSession } from "@/types";

// Cached driver info structure
interface CachedDriverInfo {
  firstName: string;
  lastName: string;
  acronym: string;
  teamName: string;
  teamColour: string;
}

// Wrapper for cached race results with metadata
interface CachedRaceResultEntry {
  data: RaceResult;
  cachedAt: number; // timestamp in ms
}

// Result of cache lookup with staleness info
export interface CacheResult {
  data: RaceResult;
  isStale: boolean;
  cachedAt: number;
}

/**
 * Calculate soft TTL based on race age.
 * Newer races have shorter TTLs to capture post-race corrections.
 */
function getSoftTTL(raceDate: string): number {
  const ageMs = Date.now() - new Date(raceDate).getTime();
  const hours = ageMs / (1000 * 60 * 60);

  if (hours < 6) return 5 * 60 * 1000;              // 5 minutes - immediate post-race
  if (hours < 24) return 30 * 60 * 1000;            // 30 minutes - same day
  if (hours < 24 * 7) return 4 * 60 * 60 * 1000;    // 4 hours - within a week
  if (hours < 24 * 30) return 24 * 60 * 60 * 1000;  // 24 hours - within a month
  return 7 * 24 * 60 * 60 * 1000;                   // 7 days - historical
}

/**
 * Calculate hard TTL for KV expiration (2x soft TTL).
 * This is when KV actually deletes the entry.
 */
function getHardTTL(raceDate: string): number {
  return Math.floor((getSoftTTL(raceDate) * 2) / 1000); // KV uses seconds
}

// Cached team info structure (extracted from driver data)
interface CachedTeamInfo {
  name: string;
  colour: string;
}

// Get driver info from KV cache
export async function getDriverFromCache(
  year: number,
  driverNumber: number
): Promise<CachedDriverInfo | null> {
  try {
    const kv = env.F1_DRIVER_NAMES;
    if (!kv) return null;

    const cached = await kv.get(`driver:${year}:${driverNumber}`, "json");
    return cached as CachedDriverInfo | null;
  } catch {
    return null;
  }
}

// Store driver info in KV cache
export async function cacheDriver(
  year: number,
  driverNumber: number,
  info: CachedDriverInfo
): Promise<void> {
  try {
    const kv = env.F1_DRIVER_NAMES;
    if (!kv) return;

    await kv.put(`driver:${year}:${driverNumber}`, JSON.stringify(info));
  } catch {
    // Silently fail - caching is best-effort
  }
}

// Cache multiple drivers at once (from API response)
// Also caches team info extracted from driver data
export async function cacheDriversFromApi(year: number, drivers: ApiDriver[]): Promise<void> {
  try {
    const kv = env.F1_DRIVER_NAMES;
    if (!kv) return;

    // Extract unique teams from drivers
    const teams = new Map<string, CachedTeamInfo>();
    for (const driver of drivers) {
      if (driver.team_name && !teams.has(driver.team_name)) {
        teams.set(driver.team_name, {
          name: driver.team_name,
          colour: driver.team_colour,
        });
      }
    }

    // Cache drivers and teams in parallel
    await Promise.all([
      // Cache drivers
      ...drivers.map((driver) =>
        kv.put(
          `driver:${year}:${driver.driver_number}`,
          JSON.stringify({
            firstName: driver.first_name,
            lastName: driver.last_name,
            acronym: driver.name_acronym,
            teamName: driver.team_name,
            teamColour: driver.team_colour,
          } satisfies CachedDriverInfo)
        )
      ),
      // Cache teams
      ...Array.from(teams.entries()).map(([name, info]) =>
        kv.put(`team:${year}:${name}`, JSON.stringify(info))
      ),
    ]);
  } catch {
    // Silently fail
  }
}

// Get team info from KV cache
export async function getTeamFromCache(
  year: number,
  teamName: string
): Promise<CachedTeamInfo | null> {
  try {
    const kv = env.F1_DRIVER_NAMES;
    if (!kv) return null;

    const cached = await kv.get(`team:${year}:${teamName}`, "json");
    return cached as CachedTeamInfo | null;
  } catch {
    return null;
  }
}

// Get all cached team names for a year
export async function getAllCachedTeams(year: number): Promise<string[]> {
  try {
    const kv = env.F1_DRIVER_NAMES;
    if (!kv) return [];

    const prefix = `team:${year}:`;
    const list = await kv.list({ prefix });
    return list.keys.map((k) => k.name.replace(prefix, ""));
  } catch {
    return [];
  }
}

// Get race result from KV cache with staleness info
export async function getRaceResultFromCache(
  year: number,
  sessionKey: number
): Promise<CacheResult | null> {
  try {
    const kv = env.F1_RACE_RESULTS;
    if (!kv) return null;

    const cached = await kv.get(`race:${year}:${sessionKey}`, "json");
    if (!cached) return null;

    // Handle both old format (raw RaceResult) and new format (CachedRaceResultEntry)
    const entry = cached as CachedRaceResultEntry | RaceResult;

    if ("cachedAt" in entry && "data" in entry) {
      // New format with metadata
      const softTTL = getSoftTTL(entry.data.date);
      const age = Date.now() - entry.cachedAt;
      return {
        data: entry.data,
        isStale: age > softTTL,
        cachedAt: entry.cachedAt,
      };
    } else {
      // Old format - treat as stale to trigger refresh
      return {
        data: entry as RaceResult,
        isStale: true,
        cachedAt: 0,
      };
    }
  } catch {
    return null;
  }
}

// Store race result in KV cache with metadata and TTL
export async function cacheRaceResult(year: number, result: RaceResult): Promise<void> {
  try {
    const kv = env.F1_RACE_RESULTS;
    if (!kv) return;

    const entry: CachedRaceResultEntry = {
      data: result,
      cachedAt: Date.now(),
    };

    const hardTTL = getHardTTL(result.date);
    await kv.put(
      `race:${year}:${result.sessionKey}`,
      JSON.stringify(entry),
      { expirationTtl: hardTTL }
    );
  } catch {
    // Silently fail
  }
}

// Get all cached race results for a year (by listing keys)
export async function getCachedRaceResultsForYear(
  year: number,
  sessionKeys: number[]
): Promise<Map<number, CacheResult>> {
  const results = new Map<number, CacheResult>();

  try {
    const kv = env.F1_RACE_RESULTS;
    if (!kv) return results;

    // Fetch all known session keys in parallel
    const cached = await Promise.all(
      sessionKeys.map(async (key) => {
        try {
          const cacheResult = await getRaceResultFromCache(year, key);
          return { key, cacheResult };
        } catch {
          // Skip corrupted entries, keep others
          return { key, cacheResult: null };
        }
      })
    );

    for (const { key, cacheResult } of cached) {
      if (cacheResult) {
        results.set(key, cacheResult);
      }
    }
  } catch {
    // Return whatever we got
  }

  return results;
}

// ============================================================================
// Session caching (full session list for a year)
// ============================================================================

// Sessions cache TTL: 1 hour (calendar rarely changes)
const SESSIONS_CACHE_TTL_SECONDS = 60 * 60;

// Wrapper for cached sessions with metadata
interface CachedSessionsEntry {
  sessions: RaceSession[];
  cachedAt: number;
}

// Result of sessions cache lookup
export interface SessionsCacheResult {
  sessions: RaceSession[];
  isStale: boolean;
}

/**
 * Get all sessions for a year from KV cache.
 * Returns all session types (Practice, Qualifying, Race, Sprint, etc.)
 */
export async function getSessionsFromCache(year: number): Promise<SessionsCacheResult | null> {
  try {
    const kv = env.F1_RACE_RESULTS;
    if (!kv) return null;

    const cached = await kv.get(`sessions:${year}`, "json");
    if (!cached) return null;

    const entry = cached as CachedSessionsEntry;
    const age = Date.now() - entry.cachedAt;
    const isStale = age > SESSIONS_CACHE_TTL_SECONDS * 1000;

    return {
      sessions: entry.sessions,
      isStale,
    };
  } catch {
    return null;
  }
}

/**
 * Cache all sessions for a year.
 * Uses a longer hard TTL (24 hours) since session data changes rarely.
 */
export async function cacheSessionsForYear(year: number, sessions: RaceSession[]): Promise<void> {
  try {
    const kv = env.F1_RACE_RESULTS;
    if (!kv) return;

    const entry: CachedSessionsEntry = {
      sessions,
      cachedAt: Date.now(),
    };

    // Hard TTL of 24 hours - sessions list changes very rarely
    await kv.put(`sessions:${year}`, JSON.stringify(entry), {
      expirationTtl: 24 * 60 * 60,
    });
  } catch {
    // Silently fail
  }
}

/**
 * Get a specific session by key from cache.
 * Useful for live polling when you need session metadata.
 */
export async function getSessionFromCache(
  year: number,
  sessionKey: number
): Promise<RaceSession | null> {
  const result = await getSessionsFromCache(year);
  if (!result) return null;
  return result.sessions.find((s) => s.session_key === sessionKey) ?? null;
}

/**
 * Filter sessions to get only main races (not sprints, practice, qualifying).
 */
export function filterRaceSessions(sessions: RaceSession[]): RaceSession[] {
  return sessions.filter(
    (s) => s.session_type === "Race" && s.session_name === "Race"
  );
}
