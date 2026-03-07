import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
  getConstructorBetChartData,
  getConstructorPointsChartData,
  getUniqueConstructors,
  getConstructorColors,
} from "@/lib/scoring";
import { getBetsForYear } from "@/lib/bets";
import type { RaceResult } from "@/types";

export const Route = createFileRoute("/constructors")({
  component: ConstructorsPage,
});

function ConstructorsPage() {
  const selectedYear = usePreferences((state) => state.selectedYear);
  const hasHydrated = useHasHydrated();
  const [raceResults, setRaceResults] = useState<RaceResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasHydrated) return;

    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const results = await fetchRaceResults(selectedYear);
        setRaceResults(results);
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
  const betChartData = hasRaceData ? getConstructorBetChartData(scoreHistory) : [];
  const pointsChartData = hasRaceData ? getConstructorPointsChartData(raceResults) : [];
  const constructors = hasRaceData ? getUniqueConstructors(raceResults) : [];
  const constructorColors = hasRaceData ? getConstructorColors(raceResults) : {};

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Constructor Standings</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Track betting performance and championship points for constructors
        </p>
      </div>

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
          <CardTitle>Constructor Bet Scores</CardTitle>
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
          <CardTitle>Constructor Championship Points</CardTitle>
          <CardDescription>
            Actual F1 championship points for each constructor throughout the season.
            Explains changes in the bet scores above.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PointsChart
            data={pointsChartData}
            entities={constructors}
            title="Championship Points Over Season"
            colors={constructorColors}
          />
        </CardContent>
      </Card>
    </div>
  );
}
