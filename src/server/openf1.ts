import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import type {
  RaceSession,
  ApiDriverChampionship,
  ApiTeamChampionship,
  ApiDriver,
  RaceResult,
  RaceDataResponse,
  FailedSession,
  UpcomingRace,
  LiveSession,
} from "@/types";
import {
  transformDriverStandings,
  transformTeamStandings,
  deriveTeamStandingsFromDriverStandings,
} from "./transforms";
import {
  getDriverFromCache,
  cacheDriversFromApi,
  getRaceResultFromCache,
  cacheRaceResult,
} from "./kv-cache";

const BASE_URL = "https://api.openf1.org/v1";
const TOKEN_URL = "https://api.openf1.org/token";

// Token cache (in-memory - acceptable since tokens are short-lived and cheap to refresh)
let cachedToken: string | null = null;
let tokenExpiry: number = 0;
let tokenRefreshPromise: Promise<string | null> | null = null;

// Rate limiting: 6 req/s, 60 req/min
// Note: This is per-isolate, so actual rates may be higher across multiple isolates
// The API will return 429 if we hit limits, which we handle with retries
const RATE_LIMIT = {
  perSecond: 6,
  perMinute: 60,
};

let requestTimestamps: number[] = [];

async function waitForRateLimit(): Promise<void> {
  const now = Date.now();

  // Clean up old timestamps (older than 1 minute)
  requestTimestamps = requestTimestamps.filter(ts => now - ts < 60000);

  // Check per-minute limit
  if (requestTimestamps.length >= RATE_LIMIT.perMinute) {
    const oldestInWindow = requestTimestamps[0];
    const waitTime = 60000 - (now - oldestInWindow) + 100; // +100ms buffer
    if (waitTime > 0) {
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  // Check per-second limit (last 1000ms)
  const recentRequests = requestTimestamps.filter(ts => now - ts < 1000);
  if (recentRequests.length >= RATE_LIMIT.perSecond) {
    const oldestRecent = recentRequests[0];
    const waitTime = 1000 - (now - oldestRecent) + 50; // +50ms buffer
    if (waitTime > 0) {
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  // Record this request
  requestTimestamps.push(Date.now());
}

const DEFAULT_TIMEOUT_MS = 5000;

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function refreshToken(): Promise<string | null> {
  const username = env.OPENF1_USERNAME;
  const password = env.OPENF1_PASSWORD;

  if (!username || !password) {
    console.warn("OpenF1 credentials not configured, using unauthenticated requests");
    return null;
  }

  try {
    const params = new URLSearchParams();
    params.append("username", username);
    params.append("password", password);

    const response = await fetchWithTimeout(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });

    if (response.ok) {
      const tokenData = await response.json<{access_token: string, expires_in: string}>();
      cachedToken = tokenData.access_token;
      tokenExpiry = Date.now() + (parseInt(tokenData.expires_in, 10) * 1000);
      return cachedToken;
    } else {
      console.error("Error obtaining token:", response.status, await response.text());
      return null;
    }
  } catch (error) {
    console.error("Failed to get access token:", error);
    return null;
  }
}

async function getAccessToken(): Promise<string | null> {
  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && Date.now() < tokenExpiry - 60000) {
    return cachedToken;
  }

  // If a refresh is already in progress, wait for it
  if (tokenRefreshPromise) {
    return tokenRefreshPromise;
  }

  // Start refresh and store the promise
  tokenRefreshPromise = refreshToken();

  try {
    return await tokenRefreshPromise;
  } finally {
    tokenRefreshPromise = null;
  }
}

async function authenticatedFetch(url: string, retries = 3): Promise<Response> {
  await waitForRateLimit();

  const token = await getAccessToken();

  const headers: HeadersInit = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetchWithTimeout(url, { headers });

  // Retry on rate limit with exponential backoff
  if (response.status === 429 && retries > 0) {
    const retryAfter = response.headers.get("Retry-After");
    const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : 2000 * (4 - retries);
    await new Promise(resolve => setTimeout(resolve, waitTime));
    return authenticatedFetch(url, retries - 1);
  }

  return response;
}

// In-memory cache only for session list (cheap to refetch, changes rarely)
// Race results and driver names use KV for persistence
const sessionsCache = new Map<number, { sessions: RaceSession[]; timestamp: number }>();
const SESSIONS_CACHE_TTL = 60 * 60 * 1000; // 1 hour

function isRaceCompleted(raceDate: string): boolean {
  const raceTime = new Date(raceDate).getTime();
  const now = Date.now();
  // Consider a race "completed" if it started more than 3 hours ago
  return now - raceTime > 3 * 60 * 60 * 1000;
}

// Check if a race is currently in progress (started but not completed)
function isRaceOngoing(raceDate: string): boolean {
  const raceTime = new Date(raceDate).getTime();
  const now = Date.now();
  const threeHoursMs = 3 * 60 * 60 * 1000;
  // Race is ongoing if it has started but hasn't been going for more than 3 hours
  return now >= raceTime && now - raceTime < threeHoursMs;
}

// Find the ongoing race session if one exists
function getOngoingRace(sessions: RaceSession[]): RaceSession | null {
  for (const session of sessions) {
    if (isRaceOngoing(session.date_start)) {
      return session;
    }
  }
  return null;
}

// Look up a driver by number using the API (searches recent sessions)
async function lookupDriverByNumber(
  driverNumber: number,
  year: number
): Promise<ApiDriver | null> {
  try {
    // First check KV cache
    const cached = await getDriverFromCache(year, driverNumber);
    if (cached) {
      return {
        driver_number: driverNumber,
        first_name: cached.firstName,
        last_name: cached.lastName,
        name_acronym: cached.acronym,
        team_name: cached.teamName,
        team_colour: cached.teamColour || "",
        // Fill in required fields with defaults
        meeting_key: 0,
        session_key: 0,
        broadcast_name: `${cached.firstName} ${cached.lastName}`,
        full_name: `${cached.firstName} ${cached.lastName}`,
        headshot_url: "",
        country_code: null,
      };
    }

    // Query the API for this driver number (any session in this year)
    const response = await authenticatedFetch(
      `${BASE_URL}/drivers?driver_number=${driverNumber}&year=${year}`
    );

    if (response.ok) {
      const drivers: ApiDriver[] = await response.json();
      if (drivers.length > 0) {
        // Return the most recent entry (last in array)
        const driver = drivers[drivers.length - 1];
        // Cache for future lookups
        await cacheDriversFromApi(year, [driver]);
        return driver;
      }
    }

    return null;
  } catch {
    return null;
  }
}

// Background refresh for stale cache entries (fire-and-forget)
// Fetches fresh data from API and updates the cache for next request
async function refreshRaceResult(
  session: RaceSession,
  year: number,
  localDriverMap: Map<number, ApiDriver>
): Promise<void> {
  try {
    // Fetch driver standings, team standings, and driver info in parallel
    const [driverChampResponse, teamChampResponse, driversResponse] = await Promise.all([
      authenticatedFetch(
        `${BASE_URL}/championship_drivers?session_key=${session.session_key}`
      ),
      authenticatedFetch(
        `${BASE_URL}/championship_teams?session_key=${session.session_key}`
      ),
      authenticatedFetch(
        `${BASE_URL}/drivers?session_key=${session.session_key}`
      ),
    ]);

    // Parse session drivers
    let sessionDrivers: ApiDriver[] = [];
    if (driversResponse.ok) {
      sessionDrivers = await driversResponse.json();
      // Cache all drivers to KV for future lookups
      await cacheDriversFromApi(year, sessionDrivers);
      // Add to local map
      for (const driver of sessionDrivers) {
        localDriverMap.set(driver.driver_number, driver);
      }
    }

    if (driverChampResponse.ok && teamChampResponse.ok) {
      const apiDriverStandings: ApiDriverChampionship[] = await driverChampResponse.json();
      const apiTeamStandings: ApiTeamChampionship[] = await teamChampResponse.json();

      if (apiDriverStandings.length > 0 || apiTeamStandings.length > 0) {
        // Check for unknown drivers and look them up
        const unknownDriverNumbers = apiDriverStandings
          .filter((s) => !localDriverMap.has(s.driver_number))
          .map((s) => s.driver_number);

        if (unknownDriverNumbers.length > 0) {
          const lookups = await Promise.all(
            unknownDriverNumbers.map((num) => lookupDriverByNumber(num, year))
          );
          for (const driver of lookups) {
            if (driver) {
              localDriverMap.set(driver.driver_number, driver);
            }
          }
        }

        const allDrivers = Array.from(localDriverMap.values());
        const driverStandings = transformDriverStandings(
          apiDriverStandings,
          allDrivers,
          session.session_key
        );

        // Use API team standings if they have valid team names,
        // otherwise derive from driver standings (more reliable)
        const hasNullTeamNames = apiTeamStandings.some((t) => t.team_name == null);
        const teamStandings = hasNullTeamNames
          ? deriveTeamStandingsFromDriverStandings(driverStandings, session.session_key)
          : transformTeamStandings(apiTeamStandings, allDrivers, session.session_key);

        const result: RaceResult = {
          sessionKey: session.session_key,
          location: session.location,
          date: session.date_start,
          circuitName: session.circuit_short_name,
          countryName: session.country_name,
          driverStandings: driverStandings.sort((a, b) => a.position - b.position),
          teamStandings: teamStandings.sort((a, b) => a.position - b.position),
        };

        // Update the cache with fresh data
        await cacheRaceResult(year, result);
        console.log(`[refreshRaceResult] Updated cache for session ${session.session_key}`);
      }
    }
  } catch (error) {
    console.warn(`[refreshRaceResult] Failed to refresh session ${session.session_key}:`, error);
  }
}

// Batched fetch - gets all race data in one server call
export const fetchAllRaceData = createServerFn({ method: "GET" })
  .inputValidator((data: { year: number; simulateLive?: boolean }) => data)
  .handler(async ({ data }): Promise<RaceDataResponse> => {
    // Get sessions (in-memory cache is fine here - cheap to refetch)
    let sessions: RaceSession[];
    const cachedSessions = sessionsCache.get(data.year);

    if (cachedSessions && Date.now() - cachedSessions.timestamp < SESSIONS_CACHE_TTL) {
      sessions = cachedSessions.sessions;
    } else {
      // This endpoint returns ALL race sessions for the year, including upcoming races
      const sessionsResponse = await authenticatedFetch(
        `${BASE_URL}/sessions?session_name=Race&year=${data.year}`
      );

      if (!sessionsResponse.ok) {
        throw new Error(`Failed to fetch race sessions for ${data.year}: ${sessionsResponse.statusText}`);
      }

      sessions = await sessionsResponse.json();
      sessions.sort(
        (a, b) => new Date(a.date_start).getTime() - new Date(b.date_start).getTime()
      );
      sessionsCache.set(data.year, { sessions, timestamp: Date.now() });
    }

    const results: RaceResult[] = [];
    const upcomingRaces: UpcomingRace[] = [];
    const failedSessions: FailedSession[] = [];

    // Build a local driver map as we process sessions (for within-request use)
    const localDriverMap = new Map<number, ApiDriver>();

    for (const session of sessions) {
      // Collect future races as upcoming (no standings data yet)
      if (new Date(session.date_start).getTime() > Date.now()) {
        upcomingRaces.push({
          sessionKey: session.session_key,
          location: session.location,
          date: session.date_start,
          circuitName: session.circuit_short_name,
          countryName: session.country_name,
        });
        continue;
      }

      // Check KV cache first (stale-while-revalidate)
      const cacheResult = await getRaceResultFromCache(data.year, session.session_key);
      if (cacheResult) {
        let resultData = cacheResult.data;

        // Check if cached data has null team names (bad data from old API responses)
        const hasNullTeamNames = resultData.teamStandings.some((t) => t.team_name == null);
        if (hasNullTeamNames) {
          // Re-derive team standings from driver standings (which have reliable team names)
          const fixedTeamStandings = deriveTeamStandingsFromDriverStandings(
            resultData.driverStandings,
            resultData.sessionKey
          );
          resultData = { ...resultData, teamStandings: fixedTeamStandings };
          // Update cache with fixed data (fire-and-forget)
          cacheRaceResult(data.year, resultData).catch(() => {});
        }

        // Always use cached data (stale or not)
        results.push(resultData);

        // If stale, trigger background refresh (fire-and-forget)
        // The refresh updates the cache for the next request
        if (cacheResult.isStale) {
          refreshRaceResult(session, data.year, localDriverMap).catch(() => {});
        }

        continue;
      }

      // No cache - only fetch from API for ongoing or recently completed races
      const isCompleted = isRaceCompleted(session.date_start);

      try {
        // Fetch driver standings, team standings, and driver info in parallel
        const [driverChampResponse, teamChampResponse, driversResponse] = await Promise.all([
          authenticatedFetch(
            `${BASE_URL}/championship_drivers?session_key=${session.session_key}`
          ),
          authenticatedFetch(
            `${BASE_URL}/championship_teams?session_key=${session.session_key}`
          ),
          authenticatedFetch(
            `${BASE_URL}/drivers?session_key=${session.session_key}`
          ),
        ]);

        // Parse session drivers
        let sessionDrivers: ApiDriver[] = [];
        if (driversResponse.ok) {
          sessionDrivers = await driversResponse.json();
          // Cache all drivers to KV for future lookups
          await cacheDriversFromApi(data.year, sessionDrivers);
          // Add to local map for this request
          for (const driver of sessionDrivers) {
            localDriverMap.set(driver.driver_number, driver);
          }
        }

        if (driverChampResponse.ok && teamChampResponse.ok) {
          const apiDriverStandings: ApiDriverChampionship[] = await driverChampResponse.json();
          const apiTeamStandings: ApiTeamChampionship[] = await teamChampResponse.json();

          if (apiDriverStandings.length > 0 || apiTeamStandings.length > 0) {
            // Check for unknown drivers and look them up
            const unknownDriverNumbers = apiDriverStandings
              .filter((s) => !localDriverMap.has(s.driver_number))
              .map((s) => s.driver_number);

            if (unknownDriverNumbers.length > 0) {
              // Look up unknown drivers in parallel
              const lookups = await Promise.all(
                unknownDriverNumbers.map((num) => lookupDriverByNumber(num, data.year))
              );
              for (const driver of lookups) {
                if (driver) {
                  localDriverMap.set(driver.driver_number, driver);
                }
              }
            }

            const allDrivers = Array.from(localDriverMap.values());
            const driverStandings = transformDriverStandings(
              apiDriverStandings,
              allDrivers,
              session.session_key
            );

            // Use API team standings if they have valid team names,
            // otherwise derive from driver standings (more reliable)
            const hasNullTeamNames = apiTeamStandings.some((t) => t.team_name == null);
            const teamStandings = hasNullTeamNames
              ? deriveTeamStandingsFromDriverStandings(driverStandings, session.session_key)
              : transformTeamStandings(apiTeamStandings, allDrivers, session.session_key);

            const result: RaceResult = {
              sessionKey: session.session_key,
              location: session.location,
              date: session.date_start,
              circuitName: session.circuit_short_name,
              countryName: session.country_name,
              driverStandings: driverStandings.sort((a, b) => a.position - b.position),
              teamStandings: teamStandings.sort((a, b) => a.position - b.position),
            };

            results.push(result);

            // Cache completed races to KV
            if (isCompleted) {
              await cacheRaceResult(data.year, result);
            }
          }
        }
      } catch (error) {
        console.warn(`Skipping session ${session.session_key}:`, error);
        failedSessions.push({
          sessionKey: session.session_key,
          location: session.location,
          circuitName: session.circuit_short_name,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // Check if there's a race currently in progress
    let ongoingRace = getOngoingRace(sessions);

    // DEV: Simulate live mode by treating the last completed race as ongoing
    if (data.simulateLive && !ongoingRace && results.length > 0) {
      const lastResult = results[results.length - 1];
      ongoingRace = sessions.find((s) => s.session_key === lastResult.sessionKey) ?? null;
    }

    const liveSession: LiveSession | undefined = ongoingRace
      ? {
          sessionKey: ongoingRace.session_key,
          location: ongoingRace.location,
          circuitName: ongoingRace.circuit_short_name,
          countryName: ongoingRace.country_name,
          raceStartTime: ongoingRace.date_start,
        }
      : undefined;

    return { results, upcomingRaces, failedSessions, totalRaces: sessions.length, liveSession };
  });

// Lightweight fetch for just a single live race session
// Used for polling during an ongoing race without refetching all historical data
// Assumes drivers are already cached from the initial fetchAllRaceData call
export const fetchLiveRaceData = createServerFn({ method: "GET" })
  .inputValidator((data: { sessionKey: number; year: number; simulateLive?: boolean }) => data)
  .handler(async ({ data }): Promise<RaceResult | null> => {
    try {
      // Fetch only championship data - driver info should be cached from initial load
      const [driverChampResponse, teamChampResponse] = await Promise.all([
        authenticatedFetch(
          `${BASE_URL}/championship_drivers?session_key=${data.sessionKey}`
        ),
        authenticatedFetch(
          `${BASE_URL}/championship_teams?session_key=${data.sessionKey}`
        ),
      ]);

      if (!driverChampResponse.ok || !teamChampResponse.ok) {
        console.warn(`Failed to fetch live data for session ${data.sessionKey}`);
        return null;
      }

      const apiDriverStandings: ApiDriverChampionship[] = await driverChampResponse.json();
      const apiTeamStandings: ApiTeamChampionship[] = await teamChampResponse.json();

      if (apiDriverStandings.length === 0 && apiTeamStandings.length === 0) {
        return null;
      }

      // Get all drivers from KV cache (populated by initial fetchAllRaceData)
      const localDriverMap = new Map<number, ApiDriver>();
      const driverNumbers = apiDriverStandings.map((s) => s.driver_number);

      const cachedLookups = await Promise.all(
        driverNumbers.map(async (num) => {
          const cached = await getDriverFromCache(data.year, num);
          return cached ? { num, cached } : null;
        })
      );

      for (const result of cachedLookups) {
        if (result) {
          localDriverMap.set(result.num, {
            driver_number: result.num,
            first_name: result.cached.firstName,
            last_name: result.cached.lastName,
            name_acronym: result.cached.acronym,
            team_name: result.cached.teamName,
            team_colour: result.cached.teamColour || "",
            meeting_key: 0,
            session_key: data.sessionKey,
            broadcast_name: `${result.cached.firstName} ${result.cached.lastName}`,
            full_name: `${result.cached.firstName} ${result.cached.lastName}`,
            headshot_url: "",
            country_code: null,
          });
        }
      }

      // If any drivers are missing from cache, fetch from API
      const missingDriverNumbers = driverNumbers.filter((num) => !localDriverMap.has(num));
      if (missingDriverNumbers.length > 0) {
        const driversResponse = await authenticatedFetch(
          `${BASE_URL}/drivers?session_key=${data.sessionKey}`
        );
        if (driversResponse.ok) {
          const sessionDrivers: ApiDriver[] = await driversResponse.json();
          await cacheDriversFromApi(data.year, sessionDrivers);
          for (const driver of sessionDrivers) {
            localDriverMap.set(driver.driver_number, driver);
          }
        }

        // Some drivers might not be in this session (reserves, etc.)
        // Look them up across all sessions
        const stillMissing = driverNumbers.filter((num) => !localDriverMap.has(num));
        if (stillMissing.length > 0) {
          const lookups = await Promise.all(
            stillMissing.map((num) => lookupDriverByNumber(num, data.year))
          );
          for (const driver of lookups) {
            if (driver) {
              localDriverMap.set(driver.driver_number, driver);
            }
          }
        }
      }

      const allDrivers = Array.from(localDriverMap.values());
      let driverStandings = transformDriverStandings(
        apiDriverStandings,
        allDrivers,
        data.sessionKey,
        { skipMissing: true } // Don't fail on missing drivers during live updates
      );

      // Use API team standings if they have valid team names,
      // otherwise derive from driver standings (more reliable)
      const hasNullTeamNames = apiTeamStandings.some((t) => t.team_name == null);
      const teamStandings = hasNullTeamNames
        ? deriveTeamStandingsFromDriverStandings(driverStandings, data.sessionKey)
        : transformTeamStandings(apiTeamStandings, allDrivers, data.sessionKey);

      // DEV: Simulate random overtake by swapping two adjacent drivers
      // Points stay with position (like real API during live race)
      if (data.simulateLive && driverStandings.length >= 2) {
        // Pick a random position (not the last one, so we can swap with next)
        const swapIndex = Math.floor(Math.random() * (driverStandings.length - 1));
        const driverA = driverStandings[swapIndex];
        const driverB = driverStandings[swapIndex + 1];

        // Swap driver identities but keep position and points tied to the position
        driverStandings = driverStandings.map((driver, idx) => {
          if (idx === swapIndex) {
            return {
              ...driverB,
              position: driverA.position,
              points: driverA.points, // Points stay with position
            };
          }
          if (idx === swapIndex + 1) {
            return {
              ...driverA,
              position: driverB.position,
              points: driverB.points, // Points stay with position
            };
          }
          return driver;
        });

        console.log(
          `[simulateLive] Swapped P${swapIndex + 1} and P${swapIndex + 2}: ` +
          `${driverA.driver_name_acronym} (now P${swapIndex + 2}) <-> ` +
          `${driverB.driver_name_acronym} (now P${swapIndex + 1})`
        );

        // Recalculate team standings based on updated driver points
        const teamPointsMap = new Map<string, number>();
        const teamColorsMap = new Map<string, string>();

        for (const driver of driverStandings) {
          const currentPoints = teamPointsMap.get(driver.team_name) || 0;
          teamPointsMap.set(driver.team_name, currentPoints + driver.points);
          if (!teamColorsMap.has(driver.team_name)) {
            teamColorsMap.set(driver.team_name, driver.team_colour);
          }
        }

        // Convert to array and sort by points descending
        const recalculatedTeams = Array.from(teamPointsMap.entries())
          .map(([teamName, points]) => ({
            team_name: teamName,
            team_colour: teamColorsMap.get(teamName) || "",
            points,
            session_key: data.sessionKey,
            position: 0, // Will be set below
          }))
          .sort((a, b) => b.points - a.points)
          .map((team, idx) => ({ ...team, position: idx + 1 }));

        // Replace team standings with recalculated values
        teamStandings.length = 0;
        teamStandings.push(...recalculatedTeams);
      }

      // Session metadata should be in the in-memory cache from initial load
      const sessionInfo = sessionsCache.get(data.year)?.sessions.find(
        (s) => s.session_key === data.sessionKey
      );

      return {
        sessionKey: data.sessionKey,
        location: sessionInfo?.location ?? "Unknown",
        date: sessionInfo?.date_start ?? new Date().toISOString(),
        circuitName: sessionInfo?.circuit_short_name ?? "Unknown",
        countryName: sessionInfo?.country_name ?? "Unknown",
        driverStandings: driverStandings.sort((a, b) => a.position - b.position),
        teamStandings: teamStandings.sort((a, b) => a.position - b.position),
      };
    } catch (error) {
      console.error(`Error fetching live race data for session ${data.sessionKey}:`, error);
      return null;
    }
  });
