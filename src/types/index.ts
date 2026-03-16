// Bet structure
export interface ParticipantBet {
  constructors: string[];
  drivers: string[];
}

export interface Bets {
  [participantName: string]: ParticipantBet;
}

// OpenF1 API types (raw responses)
export interface RaceSession {
  session_key: number;
  session_name: string;
  date_start: string;
  date_end: string;
  gmt_offset: string;
  session_type: string;
  meeting_key: number;
  location: string;
  country_key: number;
  country_code: string;
  country_name: string;
  circuit_key: number;
  circuit_short_name: string;
  year: number;
}

// Raw API response from /championship_drivers
export interface ApiDriverChampionship {
  meeting_key: number;
  session_key: number;
  driver_number: number;
  position_start: number | null;
  position_current: number;
  points_start: number;
  points_current: number;
}

// Raw API response from /championship_teams
export interface ApiTeamChampionship {
  meeting_key: number;
  session_key: number;
  team_name: string;
  position_start: number | null;
  position_current: number;
  points_start: number;
  points_current: number;
}

// Raw API response from /drivers
export interface ApiDriver {
  meeting_key: number;
  session_key: number;
  driver_number: number;
  broadcast_name: string;
  full_name: string;
  name_acronym: string;
  team_name: string;
  team_colour: string;
  first_name: string;
  last_name: string;
  headshot_url: string;
  country_code: string | null;
}

// Transformed types used by the app
export interface DriverStanding {
  position: number;
  driver_number: number;
  driver_first_name: string;
  driver_last_name: string;
  driver_name_acronym: string;
  team_name: string;
  team_colour: string;
  points: number;
  session_key: number;
}

export interface TeamStanding {
  position: number;
  team_name: string;
  team_colour: string;
  points: number;
  session_key: number;
}

// Processed data types
export interface RaceResult {
  sessionKey: number;
  sessionName: string; // "Race" or "Sprint"
  location: string;
  date: string;
  circuitName: string;
  countryName: string;
  driverStandings: DriverStanding[];
  teamStandings: TeamStanding[];
}

export interface ParticipantScore {
  name: string;
  driverScore: number;
  normalizedDriverScore: number;
  constructorScore: number;
  totalScore: number;
}

export interface ParticipantScoreHistory {
  name: string;
  scores: {
    sessionKey: number;
    sessionName: string; // "Race" or "Sprint"
    circuitName: string;
    driverScore: number;
    normalizedDriverScore: number;
    constructorScore: number;
    totalScore: number;
  }[];
}

// Chart data types
export interface BetChartDataPoint {
  race: string;
  sessionKey: number;
  [participantName: string]: string | number;
}

export interface PointsChartDataPoint {
  race: string;
  sessionKey: number;
  [entityName: string]: string | number;
}

// Map of entity name to hex color (without #)
export type EntityColorMap = Record<string, string>;

// Failed session info for error reporting
export interface FailedSession {
  sessionKey: number;
  location: string;
  circuitName: string;
  error: string;
}

// Upcoming race session (no standings data yet)
export interface UpcomingRace {
  sessionKey: number;
  sessionName: string; // "Race" or "Sprint"
  location: string;
  date: string;
  circuitName: string;
  countryName: string;
}

// Live session info (race currently in progress)
export interface LiveSession {
  sessionKey: number;
  sessionName: string; // "Race" or "Sprint"
  location: string;
  circuitName: string;
  countryName: string;
  raceStartTime: string;
}

// Response from race data fetch including any failures
export interface RaceDataResponse {
  results: RaceResult[];
  upcomingRaces: UpcomingRace[];
  failedSessions: FailedSession[];
  totalRaces: number;
  /** Present if a race is currently in progress */
  liveSession?: LiveSession;
}

// Bet validation types
export interface BetMismatch {
  participantName: string;
  type: "driver" | "constructor";
  betName: string;
  suggestion: string | null;
}

export interface BetValidationResult {
  isValid: boolean;
  mismatches: BetMismatch[];
}

// Cache comparison types for debug viewer
export interface CacheDiffEntry {
  sessionKey: number;
  circuitName: string;
  sessionName: string;
  cached: RaceResult | null;
  cachedAt: number | null;
  fresh: RaceResult | null;
  hasDiff: boolean;
  diffs: CacheDiffDetail[];
  error?: string;
}

export interface CacheDiffDetail {
  field: string;
  cached: string | number | null;
  fresh: string | number | null;
}

export interface CacheDiffResponse {
  entries: CacheDiffEntry[];
  fetchedAt: number;
}
