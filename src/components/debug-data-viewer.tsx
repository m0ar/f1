import { useState, useEffect } from "react";
import { Bug, ChevronDown, ChevronRight, Copy, Check, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePreferences } from "@/stores/preferences";
import { fetchRaceResults } from "@/lib/api";
import { checkDataQuality, type DataQualityIssue } from "@/lib/scoring";
import { getBetsForYear } from "@/lib/bets";
import type { RaceDataResponse, RaceResult } from "@/types";

interface DebugDataViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type TabId = "overview" | "races" | "bets" | "raw";

export function DebugDataViewer({ open, onOpenChange }: DebugDataViewerProps) {
  const selectedYear = usePreferences((state) => state.selectedYear);
  const simulateLive = usePreferences((state) => state.simulateLive);

  const [data, setData] = useState<RaceDataResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [expandedRaces, setExpandedRaces] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchRaceResults(selectedYear, { simulateLive });
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && !data) {
      loadData();
    }
  }, [open]);

  useEffect(() => {
    // Reload when year changes
    if (open) {
      loadData();
    }
  }, [selectedYear]);

  const toggleRace = (sessionKey: number) => {
    const next = new Set(expandedRaces);
    if (next.has(sessionKey)) {
      next.delete(sessionKey);
    } else {
      next.add(sessionKey);
    }
    setExpandedRaces(next);
  };

  const copyToClipboard = async (content: string) => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const bets = getBetsForYear(selectedYear);
  const qualityIssues = data ? checkDataQuality(data.results) : [];

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "races", label: "Races", count: data?.results.length },
    { id: "bets", label: "Bets", count: Object.keys(bets).length },
    { id: "raw", label: "Raw JSON" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bug className="h-5 w-5" />
            Debug Data Viewer
            <Badge variant="outline" className="ml-2">{selectedYear}</Badge>
            {simulateLive && (
              <Badge variant="destructive" className="text-xs">SIMULATING</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-1 border-b">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className="ml-1 text-xs opacity-60">({tab.count})</span>
              )}
            </button>
          ))}
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="self-center"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto min-h-0">
          {loading && !data ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : error ? (
            <div className="p-4 text-destructive">{error}</div>
          ) : (
            <>
              {activeTab === "overview" && data && (
                <OverviewTab data={data} qualityIssues={qualityIssues} />
              )}
              {activeTab === "races" && data && (
                <RacesTab
                  races={data.results}
                  expandedRaces={expandedRaces}
                  onToggle={toggleRace}
                />
              )}
              {activeTab === "bets" && <BetsTab bets={bets} />}
              {activeTab === "raw" && data && (
                <RawTab
                  data={data}
                  onCopy={() => copyToClipboard(JSON.stringify(data, null, 2))}
                  copied={copied}
                />
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function OverviewTab({
  data,
  qualityIssues,
}: {
  data: RaceDataResponse;
  qualityIssues: DataQualityIssue[];
}) {
  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Completed Races" value={data.results.length} />
        <StatCard label="Upcoming Races" value={data.upcomingRaces.length} />
        <StatCard label="Total Races" value={data.totalRaces} />
        <StatCard
          label="Failed Sessions"
          value={data.failedSessions.length}
          variant={data.failedSessions.length > 0 ? "warning" : "default"}
        />
      </div>

      {qualityIssues.length > 0 && (
        <div className="border border-red-500/30 rounded-lg p-4 bg-red-500/5">
          <h3 className="font-semibold text-red-600 dark:text-red-400 mb-2">
            Data Quality Issues ({qualityIssues.length})
          </h3>
          <div className="space-y-1 text-sm max-h-48 overflow-auto">
            {qualityIssues.map((issue, i) => (
              <div key={i} className="flex items-start gap-2">
                <Badge variant="outline" className="text-xs shrink-0">
                  {issue.type}
                </Badge>
                <span className="text-muted-foreground">{issue.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.failedSessions.length > 0 && (
        <div className="border border-yellow-500/30 rounded-lg p-4 bg-yellow-500/5">
          <h3 className="font-semibold text-yellow-600 dark:text-yellow-400 mb-2">
            Failed Sessions
          </h3>
          <div className="space-y-1 text-sm">
            {data.failedSessions.map((session) => (
              <div key={session.sessionKey} className="flex items-center gap-2">
                <code className="text-xs bg-muted px-1 rounded">
                  {session.sessionKey}
                </code>
                <span>{session.circuitName}</span>
                <span className="text-muted-foreground text-xs">({session.error})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.results.length > 0 && (
        <div className="border rounded-lg p-4">
          <h3 className="font-semibold mb-2">Latest Race: {data.results[data.results.length - 1].circuitName}</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <h4 className="text-muted-foreground mb-1">Top 5 Drivers</h4>
              {data.results[data.results.length - 1].driverStandings.slice(0, 5).map((d) => (
                <div key={d.position} className="flex justify-between">
                  <span>{d.position}. {d.driver_first_name} {d.driver_last_name}</span>
                  <span className="text-muted-foreground">{d.points} pts</span>
                </div>
              ))}
            </div>
            <div>
              <h4 className="text-muted-foreground mb-1">Top 5 Teams</h4>
              {data.results[data.results.length - 1].teamStandings.slice(0, 5).map((t) => (
                <div key={t.position} className="flex justify-between">
                  <span className={t.team_name == null ? "text-red-500" : ""}>
                    {t.position}. {t.team_name ?? "[NULL]"}
                  </span>
                  <span className="text-muted-foreground">{t.points} pts</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  variant = "default",
}: {
  label: string;
  value: number;
  variant?: "default" | "warning";
}) {
  return (
    <div
      className={`p-3 rounded-lg border ${
        variant === "warning" && value > 0
          ? "border-yellow-500/30 bg-yellow-500/5"
          : ""
      }`}
    >
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function RacesTab({
  races,
  expandedRaces,
  onToggle,
}: {
  races: RaceResult[];
  expandedRaces: Set<number>;
  onToggle: (sessionKey: number) => void;
}) {
  return (
    <div className="divide-y">
      {races.map((race) => {
        const isExpanded = expandedRaces.has(race.sessionKey);
        const hasNullTeams = race.teamStandings.some((t) => t.team_name == null);

        return (
          <div key={race.sessionKey}>
            <button
              onClick={() => onToggle(race.sessionKey)}
              className="w-full px-4 py-3 flex items-center gap-2 hover:bg-muted/50 text-left"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0" />
              )}
              <span className="font-medium">{race.circuitName}</span>
              <span className="text-muted-foreground text-sm">
                {race.countryName}
              </span>
              <code className="text-xs bg-muted px-1 rounded ml-auto">
                {race.sessionKey}
              </code>
              {hasNullTeams && (
                <Badge variant="destructive" className="text-xs">
                  NULL DATA
                </Badge>
              )}
            </button>

            {isExpanded && (
              <div className="px-4 pb-4 grid grid-cols-2 gap-4 bg-muted/30">
                <div>
                  <h4 className="text-sm font-medium mb-2 text-muted-foreground">
                    Driver Standings ({race.driverStandings.length})
                  </h4>
                  <div className="text-xs space-y-1 max-h-64 overflow-auto">
                    {race.driverStandings.map((d) => (
                      <div
                        key={d.position}
                        className="flex justify-between items-center"
                      >
                        <span>
                          {d.position}. {d.driver_first_name} {d.driver_last_name}
                          <span className="text-muted-foreground ml-1">
                            ({d.driver_name_acronym})
                          </span>
                        </span>
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: `#${d.team_colour}` }}
                          />
                          <span className="text-muted-foreground w-12 text-right">
                            {d.points} pts
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium mb-2 text-muted-foreground">
                    Team Standings ({race.teamStandings.length})
                  </h4>
                  <div className="text-xs space-y-1 max-h-64 overflow-auto">
                    {race.teamStandings.map((t) => (
                      <div
                        key={t.position}
                        className={`flex justify-between items-center ${
                          t.team_name == null ? "text-red-500 font-medium" : ""
                        }`}
                      >
                        <span>
                          {t.position}. {t.team_name ?? "[NULL - MISSING DATA]"}
                        </span>
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full"
                            style={{
                              backgroundColor: t.team_colour
                                ? `#${t.team_colour}`
                                : "#888",
                            }}
                          />
                          <span className="text-muted-foreground w-12 text-right">
                            {t.points} pts
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function BetsTab({ bets }: { bets: Record<string, { drivers: string[]; constructors: string[] }> }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (name: string) => {
    const next = new Set(expanded);
    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }
    setExpanded(next);
  };

  return (
    <div className="divide-y">
      {Object.entries(bets).map(([name, bet]) => {
        const isExpanded = expanded.has(name);

        return (
          <div key={name}>
            <button
              onClick={() => toggle(name)}
              className="w-full px-4 py-3 flex items-center gap-2 hover:bg-muted/50 text-left"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0" />
              )}
              <span className="font-medium">{name}</span>
              <span className="text-muted-foreground text-sm ml-auto">
                {bet.drivers.length} drivers, {bet.constructors.length} teams
              </span>
            </button>

            {isExpanded && (
              <div className="px-4 pb-4 grid grid-cols-2 gap-4 bg-muted/30">
                <div>
                  <h4 className="text-sm font-medium mb-2 text-muted-foreground">
                    Driver Predictions
                  </h4>
                  <div className="text-xs space-y-1">
                    {bet.drivers.map((driver, i) => (
                      <div key={i}>
                        {i + 1}. {driver}
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium mb-2 text-muted-foreground">
                    Constructor Predictions
                  </h4>
                  <div className="text-xs space-y-1">
                    {bet.constructors.map((team, i) => (
                      <div key={i}>
                        {i + 1}. {team}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RawTab({
  data,
  onCopy,
  copied,
}: {
  data: RaceDataResponse;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="p-4">
      <div className="flex justify-end mb-2">
        <Button variant="outline" size="sm" onClick={onCopy}>
          {copied ? (
            <>
              <Check className="h-4 w-4 mr-1" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="h-4 w-4 mr-1" />
              Copy JSON
            </>
          )}
        </Button>
      </div>
      <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto max-h-[60vh] whitespace-pre-wrap">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
