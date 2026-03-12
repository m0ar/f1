import type {
  Bets,
  RaceResult,
  ParticipantScore,
  ParticipantScoreHistory,
  BetChartDataPoint,
  PointsChartDataPoint,
  EntityColorMap,
  BetValidationResult,
  BetMismatch,
} from "@/types";

export interface DataQualityIssue {
  type: "missing_team_name" | "missing_driver_name" | "missing_points" | "duplicate_position";
  message: string;
  sessionKey: number;
  position?: number;
}

/**
 * Check race results for data quality issues.
 * Returns an array of issues found.
 */
export function checkDataQuality(raceResults: RaceResult[]): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];

  for (const result of raceResults) {
    // Check team standings
    for (const team of result.teamStandings) {
      if (team.team_name == null) {
        issues.push({
          type: "missing_team_name",
          message: `Missing team name at position ${team.position} (${result.circuitName})`,
          sessionKey: result.sessionKey,
          position: team.position,
        });
      }
    }

    // Check driver standings
    for (const driver of result.driverStandings) {
      if (!driver.driver_first_name || !driver.driver_last_name) {
        issues.push({
          type: "missing_driver_name",
          message: `Missing driver name at position ${driver.position} (${result.circuitName})`,
          sessionKey: result.sessionKey,
          position: driver.position,
        });
      }
    }
  }

  return issues;
}

/**
 * Calculate the score for a single prediction list against actual standings.
 * Lower score is better (like golf).
 * Score = sum of |predicted_position - actual_position| for each item.
 */
function calculateListScore(
  predictions: string[],
  actualStandings: { name: string; position: number }[]
): number {
  let score = 0;

  for (let i = 0; i < predictions.length; i++) {
    const predictedPosition = i + 1;
    const predictedItem = predictions[i];

    // Find actual position of this item
    const actualItem = actualStandings.find(
      (s) => s.name.toLowerCase() === predictedItem.toLowerCase()
    );

    if (actualItem) {
      score += Math.abs(predictedPosition - actualItem.position);
    } else {
      // If the item isn't in standings (e.g., driver left mid-season),
      // give maximum penalty (position = last + 1)
      score += Math.abs(predictedPosition - (actualStandings.length + 1));
    }
  }

  return score;
}

/**
 * Calculate scores for all participants based on race results.
 */
export function calculateScores(
  bets: Bets,
  raceResult: RaceResult
): ParticipantScore[] {
  const driverStandings = raceResult.driverStandings.map((d) => ({
    name: `${d.driver_first_name} ${d.driver_last_name}`,
    position: d.position,
  }));

  const teamStandings = raceResult.teamStandings.map((t) => ({
    name: t.team_name ?? `[Unknown Team #${t.position}]`,
    position: t.position,
  }));

  return Object.entries(bets).map(([name, bet]) => {
    const driverScore = calculateListScore(bet.drivers, driverStandings);
    const constructorScore = calculateListScore(
      bet.constructors,
      teamStandings
    );
    // Normalize driver score (0.25x) to balance against constructor score
    // since drivers have ~2x as many positions, leading to ~4x the max diff
    const normalizedDriverScore = Math.round(driverScore * 0.25);

    return {
      name,
      driverScore,
      normalizedDriverScore,
      constructorScore,
      totalScore: normalizedDriverScore + constructorScore,
    };
  });
}

/**
 * Calculate score history for all participants across all races.
 */
export function calculateScoreHistory(
  bets: Bets,
  raceResults: RaceResult[]
): ParticipantScoreHistory[] {
  const participants = Object.keys(bets);

  return participants.map((name) => {
    const scores = raceResults.map((result) => {
      const participantScores = calculateScores(bets, result);
      const score = participantScores.find((s) => s.name === name);

      return {
        sessionKey: result.sessionKey,
        sessionName: result.sessionName,
        circuitName: result.circuitName,
        driverScore: score?.driverScore ?? 0,
        normalizedDriverScore: score?.normalizedDriverScore ?? 0,
        constructorScore: score?.constructorScore ?? 0,
        totalScore: score?.totalScore ?? 0,
      };
    });

    return { name, scores };
  });
}

/**
 * Get leaderboard (sorted by total score, lowest first).
 */
export function getLeaderboard(
  bets: Bets,
  raceResult: RaceResult
): ParticipantScore[] {
  const scores = calculateScores(bets, raceResult);
  return scores.sort((a, b) => a.totalScore - b.totalScore);
}

/**
 * Format race label with sprint indicator if applicable.
 */
function formatRaceLabel(circuitName: string, sessionName: string): string {
  return sessionName === "Sprint" ? `${circuitName} (S)` : circuitName;
}

/**
 * Convert score history to chart data format for driver bets.
 */
export function getDriverBetChartData(
  scoreHistory: ParticipantScoreHistory[]
): BetChartDataPoint[] {
  if (scoreHistory.length === 0 || scoreHistory[0].scores.length === 0) {
    return [];
  }

  const races = scoreHistory[0].scores;

  return races.map((race, index) => {
    const dataPoint: BetChartDataPoint = {
      race: formatRaceLabel(race.circuitName, race.sessionName),
      sessionKey: race.sessionKey,
    };

    scoreHistory.forEach((participant) => {
      dataPoint[participant.name] = participant.scores[index]?.driverScore ?? 0;
    });

    return dataPoint;
  });
}

/**
 * Convert score history to chart data format for constructor bets.
 */
export function getConstructorBetChartData(
  scoreHistory: ParticipantScoreHistory[]
): BetChartDataPoint[] {
  if (scoreHistory.length === 0 || scoreHistory[0].scores.length === 0) {
    return [];
  }

  const races = scoreHistory[0].scores;

  return races.map((race, index) => {
    const dataPoint: BetChartDataPoint = {
      race: formatRaceLabel(race.circuitName, race.sessionName),
      sessionKey: race.sessionKey,
    };

    scoreHistory.forEach((participant) => {
      dataPoint[participant.name] =
        participant.scores[index]?.constructorScore ?? 0;
    });

    return dataPoint;
  });
}

/**
 * Get driver championship points chart data.
 */
export function getDriverPointsChartData(
  raceResults: RaceResult[]
): PointsChartDataPoint[] {
  return raceResults.map((result) => {
    const dataPoint: PointsChartDataPoint = {
      race: formatRaceLabel(result.circuitName, result.sessionName),
      sessionKey: result.sessionKey,
    };

    result.driverStandings.forEach((driver) => {
      const name = `${driver.driver_first_name} ${driver.driver_last_name}`;
      dataPoint[name] = driver.points;
    });

    return dataPoint;
  });
}

/**
 * Get constructor championship points chart data.
 */
export function getConstructorPointsChartData(
  raceResults: RaceResult[]
): PointsChartDataPoint[] {
  return raceResults.map((result) => {
    const dataPoint: PointsChartDataPoint = {
      race: formatRaceLabel(result.circuitName, result.sessionName),
      sessionKey: result.sessionKey,
    };

    result.teamStandings.forEach((team) => {
      const name = team.team_name ?? `[Unknown #${team.position}]`;
      dataPoint[name] = team.points;
    });

    return dataPoint;
  });
}

/**
 * Get unique driver names from race results for chart legend.
 */
export function getUniqueDrivers(raceResults: RaceResult[]): string[] {
  const drivers = new Set<string>();

  raceResults.forEach((result) => {
    result.driverStandings.forEach((driver) => {
      drivers.add(`${driver.driver_first_name} ${driver.driver_last_name}`);
    });
  });

  return Array.from(drivers);
}

/**
 * Get unique constructor names from race results for chart legend.
 */
export function getUniqueConstructors(raceResults: RaceResult[]): string[] {
  const teams = new Set<string>();

  raceResults.forEach((result) => {
    result.teamStandings.forEach((team) => {
      teams.add(team.team_name ?? `[Unknown #${team.position}]`);
    });
  });

  return Array.from(teams);
}

/**
 * Get driver colors from race results (maps driver full name to team color).
 */
export function getDriverColors(raceResults: RaceResult[]): EntityColorMap {
  const colors: EntityColorMap = {};

  // Use the most recent result to get current team colors
  const latestResult = raceResults[raceResults.length - 1];
  if (!latestResult) return colors;

  latestResult.driverStandings.forEach((driver) => {
    const name = `${driver.driver_first_name} ${driver.driver_last_name}`;
    if (driver.team_colour) {
      colors[name] = driver.team_colour;
    }
  });

  return colors;
}

/**
 * Get constructor colors from race results.
 */
export function getConstructorColors(raceResults: RaceResult[]): EntityColorMap {
  const colors: EntityColorMap = {};

  // Use the most recent result to get current team colors
  const latestResult = raceResults[raceResults.length - 1];
  if (!latestResult) return colors;

  latestResult.teamStandings.forEach((team) => {
    const name = team.team_name ?? `[Unknown #${team.position}]`;
    colors[name] = team.team_colour || "888888"; // gray fallback
  });

  return colors;
}

/**
 * Simple Levenshtein distance for fuzzy matching.
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Find the closest match from a list of candidates.
 */
function findClosestMatch(
  name: string,
  candidates: string[]
): string | null {
  if (candidates.length === 0) return null;

  const nameLower = name.toLowerCase();

  // First, check for substring matches (e.g., "Haas" matches "Haas F1 Team")
  for (const candidate of candidates) {
    const candidateLower = candidate.toLowerCase();
    if (candidateLower.includes(nameLower) || nameLower.includes(candidateLower)) {
      return candidate;
    }
  }

  // Fall back to Levenshtein distance for typos/variations
  let bestMatch: string | null = null;
  let bestDistance = Infinity;

  for (const candidate of candidates) {
    const candidateLower = candidate.toLowerCase();
    const distance = levenshteinDistance(nameLower, candidateLower);

    // Only suggest if reasonably close (less than half the longer string's length)
    if (distance < bestDistance && distance < Math.max(name.length, candidate.length) / 2) {
      bestDistance = distance;
      bestMatch = candidate;
    }
  }

  return bestMatch;
}

/**
 * Extract all unique driver names from race results.
 */
export function getCanonicalDriverNames(raceResults: RaceResult[]): string[] {
  const drivers = new Set<string>();

  for (const result of raceResults) {
    for (const driver of result.driverStandings) {
      drivers.add(`${driver.driver_first_name} ${driver.driver_last_name}`);
    }
  }

  return Array.from(drivers);
}

/**
 * Extract all unique team names from race results.
 */
export function getCanonicalTeamNames(raceResults: RaceResult[]): string[] {
  const teams = new Set<string>();

  for (const result of raceResults) {
    for (const team of result.teamStandings) {
      teams.add(team.team_name ?? `[Unknown #${team.position}]`);
    }
  }

  return Array.from(teams);
}

/**
 * Validate bets against canonical names from race results.
 * Returns mismatches with suggestions for corrections.
 */
export function validateBets(
  bets: Bets,
  raceResults: RaceResult[]
): BetValidationResult {
  if (raceResults.length === 0) {
    // Can't validate without race data
    return { isValid: true, mismatches: [] };
  }

  const canonicalDrivers = getCanonicalDriverNames(raceResults);
  const canonicalTeams = getCanonicalTeamNames(raceResults);

  const canonicalDriversLower = new Set(canonicalDrivers.map((d) => d.toLowerCase()));
  const canonicalTeamsLower = new Set(canonicalTeams.map((t) => t.toLowerCase()));

  const mismatches: BetMismatch[] = [];

  for (const [participantName, bet] of Object.entries(bets)) {
    // Check drivers
    for (const driverName of bet.drivers) {
      if (!canonicalDriversLower.has(driverName.toLowerCase())) {
        mismatches.push({
          participantName,
          type: "driver",
          betName: driverName,
          suggestion: findClosestMatch(driverName, canonicalDrivers),
        });
      }
    }

    // Check constructors
    for (const teamName of bet.constructors) {
      if (!canonicalTeamsLower.has(teamName.toLowerCase())) {
        mismatches.push({
          participantName,
          type: "constructor",
          betName: teamName,
          suggestion: findClosestMatch(teamName, canonicalTeams),
        });
      }
    }
  }

  // Deduplicate mismatches (same betName across participants)
  const uniqueMismatches = mismatches.filter(
    (mismatch, index, self) =>
      index === self.findIndex(
        (m) => m.type === mismatch.type && m.betName === mismatch.betName
      )
  );

  return {
    isValid: uniqueMismatches.length === 0,
    mismatches: uniqueMismatches,
  };
}
