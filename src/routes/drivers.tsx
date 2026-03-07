import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
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
import type { RaceResult, FailedSession, BetMismatch } from "@/types";

export const Route = createFileRoute("/drivers")({
  component: DriversPage,
});

function DriversPage() {
  const selectedYear = usePreferences((state) => state.selectedYear);
  const hasHydrated = useHasHydrated();
  const [raceResults, setRaceResults] = useState<RaceResult[]>([]);
  const [failedSessions, setFailedSessions] = useState<FailedSession[]>([]);
  const [betMismatches, setBetMismatches] = useState<BetMismatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasHydrated) return;

    async function loadData() {
      setLoading(true);
      setError(null);
      setFailedSessions([]);
      setBetMismatches([]);
      try {
        const response = await fetchRaceResults(selectedYear);
        setRaceResults(response.results);
        setFailedSessions(response.failedSessions);

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
  }, [selectedYear, hasHydrated]);

  if (loading) {
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
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Driver Standings</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Track betting performance and championship points for drivers
        </p>
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
            data={betChartData}
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
            data={pointsChartData}
            entities={drivers}
            title="Championship Points Over Season"
            colors={driverColors}
          />
        </CardContent>
      </Card>
    </div>
  );
}
