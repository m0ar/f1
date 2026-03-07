import type {
  Bets,
  RaceResult,
  ParticipantScore,
  ParticipantScoreHistory,
  BetChartDataPoint,
  PointsChartDataPoint,
  EntityColorMap,
} from "@/types";

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
    name: t.team_name,
    position: t.position,
  }));

  return Object.entries(bets).map(([name, bet]) => {
    const driverScore = calculateListScore(bet.drivers, driverStandings);
    const constructorScore = calculateListScore(
      bet.constructors,
      teamStandings
    );

    return {
      name,
      driverScore,
      constructorScore,
      totalScore: driverScore + constructorScore,
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
        circuitName: result.circuitName,
        driverScore: score?.driverScore ?? 0,
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
      race: race.circuitName,
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
      race: race.circuitName,
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
      race: result.circuitName,
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
      race: result.circuitName,
      sessionKey: result.sessionKey,
    };

    result.teamStandings.forEach((team) => {
      dataPoint[team.team_name] = team.points;
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
      teams.add(team.team_name);
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
    if (team.team_colour) {
      colors[team.team_name] = team.team_colour;
    }
  });

  return colors;
}
