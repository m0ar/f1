import type {
  DriverStanding,
  TeamStanding,
  ApiDriverChampionship,
  ApiTeamChampionship,
  ApiDriver,
} from "@/types";

// Transform API driver championship data to app format
// Set skipMissing=true for live updates where some drivers might not be resolved
export function transformDriverStandings(
  apiStandings: ApiDriverChampionship[],
  drivers: ApiDriver[],
  sessionKey: number,
  options: { skipMissing?: boolean } = {}
): DriverStanding[] {
  const driverMap = new Map<number, ApiDriver>();
  for (const driver of drivers) {
    driverMap.set(driver.driver_number, driver);
  }

  const results: DriverStanding[] = [];

  for (const standing of apiStandings) {
    const driver = driverMap.get(standing.driver_number);
    if (!driver) {
      if (options.skipMissing) {
        console.warn(
          `[transformDriverStandings] Skipping driver #${standing.driver_number} ` +
          `(${standing.points_current} pts) - not found in driver data`
        );
        continue;
      }
      throw new Error(
        `Driver #${standing.driver_number} not found for session ${sessionKey}. ` +
        `This driver has ${standing.points_current} points but no driver info was fetched.`
      );
    }

    results.push({
      position: standing.position_current,
      driver_number: standing.driver_number,
      driver_first_name: driver.first_name,
      driver_last_name: driver.last_name,
      driver_name_acronym: driver.name_acronym,
      team_name: driver.team_name,
      team_colour: driver.team_colour,
      points: standing.points_current,
      session_key: sessionKey,
    });
  }

  return results;
}

// Transform API team championship data to app format
// Only use when API team standings have valid team names
// For unreliable data, use deriveTeamStandingsFromDriverStandings instead
export function transformTeamStandings(
  apiStandings: ApiTeamChampionship[],
  drivers: ApiDriver[],
  sessionKey: number
): TeamStanding[] {
  // Build team color map from driver data
  const teamColors = new Map<string, string>();
  for (const driver of drivers) {
    if (driver.team_name && driver.team_colour && !teamColors.has(driver.team_name)) {
      teamColors.set(driver.team_name, driver.team_colour);
    }
  }

  return apiStandings.map((standing) => ({
    position: standing.position_current,
    team_name: standing.team_name,
    team_colour: teamColors.get(standing.team_name) || "",
    points: standing.points_current,
    session_key: sessionKey,
  }));
}

// Better approach: derive team standings from already-transformed driver standings
export function deriveTeamStandingsFromDriverStandings(
  driverStandings: DriverStanding[],
  sessionKey: number
): TeamStanding[] {
  // Aggregate points by team
  const teamData = new Map<string, { color: string; points: number }>();

  for (const driver of driverStandings) {
    const existing = teamData.get(driver.team_name);
    if (existing) {
      existing.points += driver.points;
    } else {
      teamData.set(driver.team_name, {
        color: driver.team_colour,
        points: driver.points,
      });
    }
  }

  // Sort by points descending
  const sorted = Array.from(teamData.entries()).sort((a, b) => b[1].points - a[1].points);

  return sorted.map(([name, info], index) => ({
    position: index + 1,
    team_name: name,
    team_colour: info.color,
    points: info.points,
    session_key: sessionKey,
  }));
}
