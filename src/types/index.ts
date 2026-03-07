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
  constructorScore: number;
  totalScore: number;
}

export interface ParticipantScoreHistory {
  name: string;
  scores: {
    sessionKey: number;
    circuitName: string;
    driverScore: number;
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

// Response from race data fetch including any failures
export interface RaceDataResponse {
  results: RaceResult[];
  failedSessions: FailedSession[];
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
