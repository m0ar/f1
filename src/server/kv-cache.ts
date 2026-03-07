import { env } from "cloudflare:workers";
import type { RaceResult, ApiDriver } from "@/types";

// Cached driver info structure
interface CachedDriverInfo {
  firstName: string;
  lastName: string;
  acronym: string;
  teamName: string;
  teamColour: string;
}

// Cached team info structure (extracted from driver data)
interface CachedTeamInfo {
  name: string;
  colour: string;
}

// Get driver info from KV cache
export async function getDriverFromCache(
  driverNumber: number
): Promise<CachedDriverInfo | null> {
  try {
    const kv = (env as { F1_DRIVER_NAMES?: KVNamespace }).F1_DRIVER_NAMES;
    if (!kv) return null;

    const cached = await kv.get(`driver:${driverNumber}`, "json");
    return cached as CachedDriverInfo | null;
  } catch {
    return null;
  }
}

// Store driver info in KV cache
export async function cacheDriver(
  driverNumber: number,
  info: CachedDriverInfo
): Promise<void> {
  try {
    const kv = (env as { F1_DRIVER_NAMES?: KVNamespace }).F1_DRIVER_NAMES;
    if (!kv) return;

    await kv.put(`driver:${driverNumber}`, JSON.stringify(info));
  } catch {
    // Silently fail - caching is best-effort
  }
}

// Cache multiple drivers at once (from API response)
// Also caches team info extracted from driver data
export async function cacheDriversFromApi(drivers: ApiDriver[]): Promise<void> {
  try {
    const kv = (env as { F1_DRIVER_NAMES?: KVNamespace }).F1_DRIVER_NAMES;
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
          `driver:${driver.driver_number}`,
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
        kv.put(`team:${name}`, JSON.stringify(info))
      ),
    ]);
  } catch {
    // Silently fail
  }
}

// Get team info from KV cache
export async function getTeamFromCache(
  teamName: string
): Promise<CachedTeamInfo | null> {
  try {
    const kv = (env as { F1_DRIVER_NAMES?: KVNamespace }).F1_DRIVER_NAMES;
    if (!kv) return null;

    const cached = await kv.get(`team:${teamName}`, "json");
    return cached as CachedTeamInfo | null;
  } catch {
    return null;
  }
}

// Get all cached team names
export async function getAllCachedTeams(): Promise<string[]> {
  try {
    const kv = (env as { F1_DRIVER_NAMES?: KVNamespace }).F1_DRIVER_NAMES;
    if (!kv) return [];

    const list = await kv.list({ prefix: "team:" });
    return list.keys.map((k) => k.name.replace("team:", ""));
  } catch {
    return [];
  }
}

// Get race result from KV cache
export async function getRaceResultFromCache(
  year: number,
  sessionKey: number
): Promise<RaceResult | null> {
  try {
    const kv = (env as { F1_RACE_RESULTS?: KVNamespace }).F1_RACE_RESULTS;
    if (!kv) return null;

    const cached = await kv.get(`race:${year}:${sessionKey}`, "json");
    return cached as RaceResult | null;
  } catch {
    return null;
  }
}

// Store race result in KV cache
export async function cacheRaceResult(year: number, result: RaceResult): Promise<void> {
  try {
    const kv = (env as { F1_RACE_RESULTS?: KVNamespace }).F1_RACE_RESULTS;
    if (!kv) return;

    await kv.put(`race:${year}:${result.sessionKey}`, JSON.stringify(result));
  } catch {
    // Silently fail
  }
}

// Get all cached race results for a year (by listing keys)
export async function getCachedRaceResultsForYear(
  year: number,
  sessionKeys: number[]
): Promise<Map<number, RaceResult>> {
  const results = new Map<number, RaceResult>();

  try {
    const kv = (env as { F1_RACE_RESULTS?: KVNamespace }).F1_RACE_RESULTS;
    if (!kv) return results;

    // Fetch all known session keys in parallel
    const cached = await Promise.all(
      sessionKeys.map(async (key) => {
        const result = await kv.get(`race:${key}`, "json");
        return { key, result: result as RaceResult | null };
      })
    );

    for (const { key, result } of cached) {
      if (result) {
        results.set(key, result);
      }
    }
  } catch {
    // Return whatever we got
  }

  return results;
}
