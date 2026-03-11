import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, Radio } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BetChart } from "@/components/charts/bet-chart";
import { PointsChart } from "@/components/charts/points-chart";
import { usePreferences, useHasHydrated } from "@/stores/preferences";
import { fetchRaceResults } from "@/lib/api";
import {
  calculateScoreHistory,
  getDriverBetChartData,
  getDriverPointsChartData,
  getUniqueDrivers,
  getDriverColors,
  validateBets,
} from "@/lib/scoring";
import { getBetsForYear } from "@/lib/bets";
import type { BetMismatch, RaceDataResponse } from "@/types";
import { useLiveRaceData } from "@/hooks/useLiveRaceData";
import { Badge } from "@/components/ui/badge";
import { ChartRangeFilter, sliceByRange } from "@/components/chart-range-filter";

export const Route = createFileRoute("/drivers")({
  component: DriversPage,
});

// Empty response for initial state
const emptyResponse: RaceDataResponse = {
  results: [],
  upcomingRaces: [],
  failedSessions: [],
  totalRaces: 0,
};

function DriversPage() {
  const selectedYear = usePreferences((state) => state.selectedYear);
  const simulateLive = usePreferences((state) => state.simulateLive);
  const chartRaceRange = usePreferences((state) => state.chartRaceRange);
  const setChartRaceRange = usePreferences((state) => state.setChartRaceRange);
  const hasHydrated = useHasHydrated();
  const [initialResponse, setInitialResponse] = useState<RaceDataResponse>(emptyResponse);
  const [dataYear, setDataYear] = useState<number | null>(null); // Track which year the data is for
  const [betMismatches, setBetMismatches] = useState<BetMismatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Use live race data hook for polling during ongoing races
  const { data: raceData, isLive, lastUpdated } = useLiveRaceData(
    initialResponse,
    selectedYear,
    { enabled: hasHydrated && !loading, simulateLive }
  );

  // Destructure for convenience
  const raceResults = raceData.results;
  const failedSessions = raceData.failedSessions;

  useEffect(() => {
    if (!hasHydrated) return;

    async function loadData() {
      setLoading(true);
      setError(null);
      setBetMismatches([]);
      try {
        const response = await fetchRaceResults(selectedYear, { simulateLive });
        setInitialResponse(response);
        setDataYear(selectedYear); // Track which year this data is for

        // Validate bets against canonical names
        const betsForValidation = getBetsForYear(selectedYear);
        const validation = validateBets(betsForValidation, response.results);
        setBetMismatches(validation.mismatches);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [selectedYear, hasHydrated, simulateLive]);

  // Show loading if data is loading OR if data year doesn't match selected year
  // This prevents showing stale data while the useEffect refetches
  const isDataStale = dataYear !== null && dataYear !== selectedYear;
  if (loading || isDataStale) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const bets = getBetsForYear(selectedYear);
  const participants = Object.keys(bets);
  const hasRaceData = raceResults.length > 0;

  const scoreHistory = hasRaceData ? calculateScoreHistory(bets, raceResults) : [];
  const betChartData = hasRaceData ? getDriverBetChartData(scoreHistory) : [];
  const pointsChartData = hasRaceData ? getDriverPointsChartData(raceResults) : [];
  const drivers = hasRaceData ? getUniqueDrivers(raceResults) : [];
  const driverColors = hasRaceData ? getDriverColors(raceResults) : {};

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Driver Standings</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Track betting performance and championship points for drivers
            {isLive && lastUpdated && (
              <span className="text-xs ml-2 opacity-70">
                · Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        {isLive && (
          <Badge variant="destructive" className="text-sm w-fit animate-pulse flex items-center gap-1">
            <Radio className="h-3 w-3" />
            LIVE
          </Badge>
        )}
      </div>

      {failedSessions.length > 0 && (
        <div className="flex items-center gap-2 p-3 text-sm bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-700 dark:text-yellow-400">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>
            Failed to load {failedSessions.length} race{failedSessions.length > 1 ? "s" : ""}:{" "}
            {failedSessions.map((s) => s.circuitName).join(", ")}
          </span>
        </div>
      )}

      {betMismatches.length > 0 && (
        <div className="p-3 text-sm bg-orange-500/10 border border-orange-500/30 rounded-lg text-orange-700 dark:text-orange-400">
          <div className="flex items-center gap-2 font-medium mb-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span>Bet name mismatches detected (scores may be incorrect)</span>
          </div>
          <ul className="ml-6 space-y-1 list-disc">
            {betMismatches.map((m) => (
              <li key={`${m.type}-${m.betName}`}>
                {m.type === "driver" ? "Driver" : "Team"} "{m.betName}" not found
                {m.suggestion && (
                  <span className="text-orange-600 dark:text-orange-300">
                    {" "}— did you mean "{m.suggestion}"?
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!hasRaceData && (
        <Card>
          <CardHeader>
            <CardTitle>Season Not Started</CardTitle>
            <CardDescription>
              No race results available for {selectedYear} yet. Charts will populate once the season begins.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {hasRaceData && betChartData.length > 3 && (
        <div className="flex justify-end">
          <ChartRangeFilter
            value={chartRaceRange}
            onChange={setChartRaceRange}
            totalRaces={betChartData.length}
          />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Driver Bet Scores</CardTitle>
          <CardDescription>
            Each line shows a participant's cumulative bet difference score after each race.
            Lower is better.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BetChart
            data={sliceByRange(betChartData, chartRaceRange)}
            participants={participants}
            title="Bet Difference Over Season"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Driver Championship Points</CardTitle>
          <CardDescription>
            Actual F1 championship points for each driver throughout the season.
            Explains changes in the bet scores above.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PointsChart
            data={sliceByRange(pointsChartData, chartRaceRange)}
            entities={drivers}
            title="Championship Points Over Season"
            colors={driverColors}
          />
        </CardContent>
      </Card>
    </div>
  );
}
