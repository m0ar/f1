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

// Get race result from KV cache
export async function getRaceResultFromCache(
  year: number,
  sessionKey: number
): Promise<RaceResult | null> {
  try {
    const kv = env.F1_RACE_RESULTS;
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
    const kv = env.F1_RACE_RESULTS;
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
    const kv = env.F1_RACE_RESULTS;
    if (!kv) return results;

    // Fetch all known session keys in parallel
    const cached = await Promise.all(
      sessionKeys.map(async (key) => {
        try {
          const result = await kv.get(`race:${year}:${key}`, "json");
          return { key, result: result as RaceResult | null };
        } catch {
          // Skip corrupted entries, keep others
          return { key, result: null };
        }
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
