import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import type {
  RaceSession,
  DriverStanding,
  TeamStanding,
  ApiDriverChampionship,
  ApiTeamChampionship,
  ApiDriver,
  RaceResult,
  RaceDataResponse,
  FailedSession,
} from "@/types";
import { transformDriverStandings, transformTeamStandings } from "./transforms";
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

export const fetchRaceSessions = createServerFn({ method: "GET" })
  .inputValidator((data: { year: number }) => data)
  .handler(async ({ data }) => {
    const response = await authenticatedFetch(
      `${BASE_URL}/sessions?session_name=Race&year=${data.year}`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch race sessions for ${data.year}: ${response.statusText}`);
    }

    const sessions: RaceSession[] = await response.json();
    return sessions.sort(
      (a, b) => new Date(a.date_start).getTime() - new Date(b.date_start).getTime()
    );
  });

export const fetchDriverStandings = createServerFn({ method: "GET" })
  .inputValidator((data: { sessionKey: number }) => data)
  .handler(async ({ data }) => {
    const response = await authenticatedFetch(
      `${BASE_URL}/championship_drivers?session_key=${data.sessionKey}`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch driver standings for session ${data.sessionKey}: ${response.statusText}`);
    }

    const standings: DriverStanding[] = await response.json();
    return standings.sort((a, b) => a.position - b.position);
  });

export const fetchTeamStandings = createServerFn({ method: "GET" })
  .inputValidator((data: { sessionKey: number }) => data)
  .handler(async ({ data }) => {
    const response = await authenticatedFetch(
      `${BASE_URL}/championship_teams?session_key=${data.sessionKey}`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch team standings for session ${data.sessionKey}: ${response.statusText}`);
    }

    const standings: TeamStanding[] = await response.json();
    return standings.sort((a, b) => a.position - b.position);
  });

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

// Batched fetch - gets all race data in one server call
export const fetchAllRaceData = createServerFn({ method: "GET" })
  .inputValidator((data: { year: number }) => data)
  .handler(async ({ data }): Promise<RaceDataResponse> => {
    // Get sessions (in-memory cache is fine here - cheap to refetch)
    let sessions: RaceSession[];
    const cachedSessions = sessionsCache.get(data.year);

    if (cachedSessions && Date.now() - cachedSessions.timestamp < SESSIONS_CACHE_TTL) {
      sessions = cachedSessions.sessions;
    } else {
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
    const failedSessions: FailedSession[] = [];

    // Build a local driver map as we process sessions (for within-request use)
    const localDriverMap = new Map<number, ApiDriver>();

    for (const session of sessions) {
      // Skip future races
      if (new Date(session.date_start).getTime() > Date.now()) {
        continue;
      }

      // Check KV cache for completed races
      const isCompleted = isRaceCompleted(session.date_start);
      if (isCompleted) {
        const cached = await getRaceResultFromCache(data.year, session.session_key);
        if (cached) {
          results.push(cached);
          continue;
        }
      }

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
            const teamStandings = transformTeamStandings(
              apiTeamStandings,
              allDrivers,
              session.session_key
            );

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

    return { results, failedSessions, totalRaces: sessions.length };
  });
