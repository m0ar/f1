import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { motion } from "motion/react";
import { Trophy, TrendingUp, TrendingDown, Minus, Eye, AlertTriangle, ChevronLeft, ChevronRight, Radio } from "lucide-react";
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
import { getLeaderboard, validateBets, checkDataQuality } from "@/lib/scoring";
import { getBetsForYear } from "@/lib/bets";
import type { ParticipantScore } from "@/types";
import { useLiveRaceData } from "@/hooks/useRaceData";

export const Route = createFileRoute("/")({
  component: LeaderboardPage,
});

function LeaderboardPage() {
  const selectedYear = usePreferences((state) => state.selectedYear);
  const simulateLive = usePreferences((state) => state.simulateLive);
  const hasHydrated = useHasHydrated();

  // Track user's explicit race selection (null = auto-select latest)
  const [userSelectedIndex, setUserSelectedIndex] = useState<number | null>(null);
  const [selectedParticipant, setSelectedParticipant] = useState<string | null>(null);

  // Track year to reset user selection when it changes
  const prevYearRef = useRef(selectedYear);

  // Use TanStack Query for data fetching with live polling
  const { data: raceData, isLoading, error, isLive, lastUpdated } = useLiveRaceData(
    selectedYear,
    { enabled: hasHydrated, simulateLive }
  );

  // Destructure for convenience
  const raceResults = raceData?.results ?? [];
  const upcomingRaces = raceData?.upcomingRaces ?? [];
  const failedSessions = raceData?.failedSessions ?? [];
  const totalRaces = raceData?.totalRaces ?? 0;

  // Reset user selection when year changes
  if (prevYearRef.current !== selectedYear) {
    prevYearRef.current = selectedYear;
    if (userSelectedIndex !== null) {
      setUserSelectedIndex(null);
    }
  }

  // Derive actual index: use user selection if valid, otherwise latest race
  const selectedRaceIndex = userSelectedIndex !== null && userSelectedIndex < raceResults.length
    ? userSelectedIndex
    : raceResults.length > 0
      ? raceResults.length - 1
      : null;

  // Compute data quality issues and bet mismatches
  const bets = getBetsForYear(selectedYear);
  const dataQualityIssues = useMemo(
    () => checkDataQuality(raceResults),
    [raceResults]
  );
  const betMismatches = useMemo(
    () => validateBets(bets, raceResults).mismatches,
    [bets, raceResults]
  );

  // Keyboard navigation for races (left/right arrows)
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (selectedRaceIndex === null || raceResults.length === 0) return;

      if (event.key === "ArrowLeft" && selectedRaceIndex > 0) {
        event.preventDefault();
        setUserSelectedIndex(selectedRaceIndex - 1);
      } else if (event.key === "ArrowRight" && selectedRaceIndex < raceResults.length - 1) {
        event.preventDefault();
        setUserSelectedIndex(selectedRaceIndex + 1);
      }
    },
    [selectedRaceIndex, raceResults.length]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!hasHydrated || isLoading) {
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
            <CardDescription>
              {error instanceof Error ? error.message : "Failed to load data"}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const hasRaceData = raceResults.length > 0;
  const selectedResult = selectedRaceIndex !== null ? raceResults[selectedRaceIndex] : null;
  const previousResult = selectedRaceIndex !== null && selectedRaceIndex > 0 ? raceResults[selectedRaceIndex - 1] : null;

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

  const leaderboard = selectedResult ? getLeaderboard(bets, selectedResult) : null;
  const previousLeaderboard = previousResult ? getLeaderboard(bets, previousResult) : null;
  const participants = Object.keys(bets);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Leaderboard</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            {hasRaceData && selectedResult
              ? `Standings after ${selectedResult.circuitName} (${selectedResult.countryName})`
              : `Waiting for ${selectedYear} season to begin`}
            {isLive && lastUpdated && (
              <span className="text-xs ml-2 opacity-70">
                · Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isLive && (
            <Badge variant="destructive" className="text-sm w-fit animate-pulse flex items-center gap-1">
              <Radio className="h-3 w-3" />
              LIVE
            </Badge>
          )}
          <Badge variant="outline" className="text-sm w-fit">
            {raceResults.length} / {totalRaces} races
          </Badge>
        </div>
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

      {dataQualityIssues.length > 0 && (
        <div className="p-3 text-sm bg-red-500/10 border border-red-500/30 rounded-lg text-red-700 dark:text-red-400">
          <div className="flex items-center gap-2 font-medium mb-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span>Data quality issues detected ({dataQualityIssues.length})</span>
          </div>
          <ul className="ml-6 space-y-1 list-disc text-xs">
            {dataQualityIssues.slice(0, 5).map((issue, i) => (
              <li key={i}>{issue.message}</li>
            ))}
            {dataQualityIssues.length > 5 && (
              <li className="text-red-600 dark:text-red-300">
                ...and {dataQualityIssues.length - 5} more issues
              </li>
            )}
          </ul>
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
              ? "Click a completed race to view standings at that point"
              : "No races completed yet"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {raceResults.map((result, index) => {
              const isLiveRace = raceData?.liveSession?.sessionKey === result.sessionKey;
              return (
                <Badge
                  key={result.sessionKey}
                  variant={index === selectedRaceIndex ? "default" : "secondary"}
                  className={`cursor-pointer hover:opacity-80 transition-opacity ${isLiveRace ? "ring-2 ring-red-500 ring-offset-1" : ""}`}
                  onClick={() => setUserSelectedIndex(index)}
                >
                  {isLiveRace && <Radio className="h-3 w-3 mr-1" />}
                  {result.circuitName}
                </Badge>
              );
            })}
            {upcomingRaces.map((race) => (
              <Badge
                key={race.sessionKey}
                variant="outline"
                className="opacity-50 cursor-default"
              >
                {race.circuitName}
              </Badge>
            ))}
            {!hasRaceData && upcomingRaces.length === 0 && (
              <p className="text-muted-foreground text-sm">
                Race results will appear here once the season starts.
              </p>
            )}
          </div>
          {hasRaceData && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <ChevronLeft className="h-3 w-3" />
              <ChevronRight className="h-3 w-3" />
              <span>arrow keys to navigate</span>
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
          raceResult={selectedResult}
          participants={leaderboard ? leaderboard.map((p) => p.name) : participants}
          onParticipantChange={setSelectedParticipant}
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
