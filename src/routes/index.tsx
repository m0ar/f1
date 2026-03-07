import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Trophy, TrendingUp, TrendingDown, Minus, Eye, AlertTriangle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ParticipantDetail } from "@/components/participant-detail";
import { usePreferences, useHasHydrated } from "@/stores/preferences";
import { fetchRaceResults } from "@/lib/api";
import { getLeaderboard } from "@/lib/scoring";
import { getBetsForYear } from "@/lib/bets";
import type { RaceResult, ParticipantScore, FailedSession } from "@/types";

export const Route = createFileRoute("/")({
  component: LeaderboardPage,
});

function LeaderboardPage() {
  const selectedYear = usePreferences((state) => state.selectedYear);
  const hasHydrated = useHasHydrated();
  const [raceResults, setRaceResults] = useState<RaceResult[]>([]);
  const [failedSessions, setFailedSessions] = useState<FailedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedParticipant, setSelectedParticipant] = useState<string | null>(null);

  useEffect(() => {
    if (!hasHydrated) return;

    async function loadData() {
      setLoading(true);
      setError(null);
      setFailedSessions([]);
      try {
        const response = await fetchRaceResults(selectedYear);
        setRaceResults(response.results);
        setFailedSessions(response.failedSessions);
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
  const hasRaceData = raceResults.length > 0;

  if (Object.keys(bets).length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Leaderboard</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            {selectedYear} Season
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>No Bets Data</CardTitle>
            <CardDescription>
              No betting predictions have been added for the {selectedYear} season yet.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const latestResult = hasRaceData ? raceResults[raceResults.length - 1] : null;
  const leaderboard = latestResult ? getLeaderboard(bets, latestResult) : null;

  // Calculate previous standings for trend indicators
  const previousResult = raceResults.length > 1 ? raceResults[raceResults.length - 2] : null;
  const previousLeaderboard = previousResult ? getLeaderboard(bets, previousResult) : null;

  const participants = Object.keys(bets);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Leaderboard</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            {hasRaceData && latestResult
              ? `Standings after ${latestResult.circuitName} (${latestResult.countryName})`
              : `Waiting for ${selectedYear} season to begin`}
          </p>
        </div>
        <Badge variant="outline" className="text-sm w-fit">
          {raceResults.length} / 24 races
        </Badge>
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

      {!hasRaceData && (
        <Card>
          <CardHeader>
            <CardTitle>Season Not Started</CardTitle>
            <CardDescription>
              No race results available for {selectedYear} yet. The leaderboard will populate once the season begins.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {hasRaceData && leaderboard && (
        <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {leaderboard.slice(0, 3).map((participant, index) => (
            <PodiumCard
              key={participant.name}
              participant={participant}
              position={index + 1}
              previousPosition={
                previousLeaderboard
                  ? previousLeaderboard.findIndex((p) => p.name === participant.name) + 1
                  : undefined
              }
            />
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{hasRaceData ? "Full Standings" : "Participants"}</CardTitle>
          <CardDescription>
            {hasRaceData
              ? "Lower score is better. Score = sum of position differences from predictions."
              : "Click on a participant to view their predictions."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                {hasRaceData && <TableHead className="w-12 sm:w-16">Pos</TableHead>}
                <TableHead>Participant</TableHead>
                <TableHead className="text-right hidden sm:table-cell">Driver</TableHead>
                <TableHead className="text-right hidden sm:table-cell">Constructor</TableHead>
                <TableHead className="text-right">Total</TableHead>
                {hasRaceData && <TableHead className="w-12 sm:w-16">Trend</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {hasRaceData && leaderboard
                ? leaderboard.map((participant, index) => {
                    const previousPos = previousLeaderboard
                      ? previousLeaderboard.findIndex((p) => p.name === participant.name) + 1
                      : index + 1;
                    const trend = previousPos - (index + 1);

                    return (
                      <TableRow
                        key={participant.name}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setSelectedParticipant(participant.name)}
                      >
                        <TableCell className="font-medium">{index + 1}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="truncate max-w-[120px] sm:max-w-none">{participant.name}</span>
                            <Eye className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          </div>
                        </TableCell>
                        <TableCell className="text-right hidden sm:table-cell">{participant.driverScore}</TableCell>
                        <TableCell className="text-right hidden sm:table-cell">{participant.constructorScore}</TableCell>
                        <TableCell className="text-right font-semibold">
                          {participant.totalScore}
                        </TableCell>
                        <TableCell>
                          <TrendIndicator trend={trend} />
                        </TableCell>
                      </TableRow>
                    );
                  })
                : participants.map((name) => (
                    <TableRow
                      key={name}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedParticipant(name)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="truncate max-w-[120px] sm:max-w-none">{name}</span>
                          <Eye className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        </div>
                      </TableCell>
                      <TableCell className="text-right hidden sm:table-cell text-muted-foreground">N/A</TableCell>
                      <TableCell className="text-right hidden sm:table-cell text-muted-foreground">N/A</TableCell>
                      <TableCell className="text-right text-muted-foreground">N/A</TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Race History</CardTitle>
          <CardDescription>
            {hasRaceData
              ? "Results from all completed races this season"
              : "No races completed yet"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasRaceData ? (
            <div className="flex flex-wrap gap-2">
              {raceResults.map((result, index) => (
                <Badge
                  key={result.sessionKey}
                  variant={index === raceResults.length - 1 ? "default" : "secondary"}
                >
                  {result.circuitName}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Race results will appear here once the season starts.
            </p>
          )}
        </CardContent>
      </Card>

      {selectedParticipant && (
        <ParticipantDetail
          open={!!selectedParticipant}
          onOpenChange={(open) => !open && setSelectedParticipant(null)}
          participantName={selectedParticipant}
          bet={bets[selectedParticipant]}
          raceResult={latestResult}
        />
      )}
    </div>
  );
}

function PodiumCard({
  participant,
  position,
  previousPosition,
}: {
  participant: ParticipantScore;
  position: number;
  previousPosition?: number;
}) {
  const trend = previousPosition ? previousPosition - position : 0;
  const colors = {
    1: "from-yellow-500/20 to-yellow-500/5 border-yellow-500/50",
    2: "from-gray-400/20 to-gray-400/5 border-gray-400/50",
    3: "from-amber-700/20 to-amber-700/5 border-amber-700/50",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: position * 0.1 }}
    >
      <Card
        className={`bg-gradient-to-b ${colors[position as 1 | 2 | 3]} border-2`}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy
                className={`h-5 w-5 ${
                  position === 1
                    ? "text-yellow-500"
                    : position === 2
                    ? "text-gray-400"
                    : "text-amber-700"
                }`}
              />
              <span className="text-2xl font-bold">#{position}</span>
            </div>
            <TrendIndicator trend={trend} />
          </div>
          <CardTitle className="text-xl">{participant.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-xs text-muted-foreground">Drivers</p>
              <p className="text-lg font-semibold">{participant.driverScore}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Constructors</p>
              <p className="text-lg font-semibold">{participant.constructorScore}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-lg font-bold">{participant.totalScore}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function TrendIndicator({ trend }: { trend: number }) {
  if (trend > 0) {
    return (
      <div className="flex items-center text-green-500">
        <TrendingUp className="h-4 w-4" />
        <span className="text-xs ml-1">+{trend}</span>
      </div>
    );
  }
  if (trend < 0) {
    return (
      <div className="flex items-center text-red-500">
        <TrendingDown className="h-4 w-4" />
        <span className="text-xs ml-1">{trend}</span>
      </div>
    );
  }
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}
