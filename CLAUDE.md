# F1 Betting Tracker

A webapp for tracking friendly Formula 1 season prediction bets among friends.

## Project Overview

Before each F1 season, participants submit their predictions for:
1. Constructor (team) standings - ordered list of all teams
2. Driver standings - ordered list of all drivers

The app tracks how accurate these predictions are as the season progresses, with live updates during races.

## Tech Stack

- **Framework**: React 19 with the React Compiler for automatic memoization
- **Routing**: TanStack Router via TanStack Start (react-start)
- **Language**: TypeScript 5.9
- **Build**: Vite
- **Deployment**: Cloudflare Workers with `@cloudflare/vite-plugin`
- **Styling**: Tailwind CSS 4
- **Components**: shadcn/ui (use CLI to add components)
- **State**: Zustand for client state (UI preferences, theme)
- **Charts**: Recharts
- **Icons**: lucide-react
- **Animations**: motion (framer-motion)

## Features

### Pages (Tab Layout)

1. **Leaderboard** - Overview of participant standings in the betting game
2. **Drivers** - Driver bet tracking and championship points
3. **Constructors** - Constructor bet tracking and championship points

### Year Selector
- Support multiple seasons (2025, 2026, etc.)
- Each year has its own bets file with year-appropriate drivers/constructors
- 2025 season has complete data for testing
- 2026 season starts March 2026

### Theme
- Light/dark mode with toggle switch
- Persist preference in Zustand store

### Charts

#### Driver Bets Chart (Drivers page)
- Line chart with one line per participant
- X-axis: Races in the season
- Y-axis: Cumulative bet difference score after each race
- Shows who's winning the prediction game over time

#### Driver Points Chart (Drivers page)
- Line chart showing actual F1 championship standings
- X-axis: Races in the season
- Y-axis: Cumulative championship points per driver
- Helps explain jumps in the bet diff chart above

#### Constructor Bets Chart (Constructors page)
- Same structure as Driver Bets Chart but for constructor predictions

#### Constructor Points Chart (Constructors page)
- Same structure as Driver Points Chart but for constructors

### Participant Detail View
- Click on a participant to see their predictions vs actual standings
- Shows their predicted order alongside current actual order
- Highlights position differences

### Live Updates
- OpenF1 API updates live during races based on track positions
- The last/current race shows "interactive" real-time standings

## Data Sources

### Bets Files

Year-specific JSON files in `src/data/`:
- `bets_2025.json` - 2025 season predictions (10 teams, 20 drivers)
- `bets_2026.json` - 2026 season predictions (11 teams, 22 drivers)

Format:
```json
{
  "Participant Name": {
    "constructors": ["Team1", "Team2", ...],
    "drivers": ["Driver Name 1", "Driver Name 2", ...]
  }
}
```

Driver and constructor names should match the normalized names from OpenF1 API (see `src/lib/api.ts` for name mappings).

### OpenF1 API

**Race Sessions** (metadata, location, date):
```
GET https://api.openf1.org/v1/sessions?session_name=Race&year={year}
```

**Driver Championship Standings** (after each race):
```
GET https://api.openf1.org/v1/championship_drivers?session_key={session_key}
```

**Constructor Championship Standings** (after each race):
```
GET https://api.openf1.org/v1/championship_teams?session_key={session_key}
```

## Scoring System

**Goal**: Lowest score wins (like golf)

**Calculation**: For each item in a participant's prediction list:
- Score = |predicted_position - actual_position|
- Total score = sum of all position differences

**Example**:
- Participant predicts Ferrari 1st, Mercedes 2nd, McLaren 3rd
- Actual standings: McLaren 1st, Ferrari 2nd, Mercedes 3rd
- Ferrari: |1 - 2| = 1 point
- Mercedes: |2 - 3| = 1 point
- McLaren: |3 - 1| = 2 points
- Total: 4 points

## Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Deploy to Cloudflare Workers
pnpm deploy
```

## Project Structure

```
src/
├── app.tsx                   # App entry with RouterProvider
├── router.tsx                # TanStack Router config
├── routeTree.gen.ts          # Auto-generated route tree
├── styles.css                # Tailwind CSS + shadcn/ui styles
├── routes/
│   ├── __root.tsx            # Root layout with tabs and theme toggle
│   ├── index.tsx             # Leaderboard page (default)
│   ├── drivers.tsx           # Drivers page
│   └── constructors.tsx      # Constructors page
├── components/
│   ├── ui/                   # shadcn/ui components
│   ├── charts/               # Recharts wrapper components
│   ├── theme-toggle.tsx
│   ├── year-selector.tsx
│   └── participant-detail.tsx
├── lib/
│   ├── api.ts                # OpenF1 API client + name normalization
│   ├── bets.ts               # Year-specific bets loader
│   ├── scoring.ts            # Bet scoring calculations
│   └── utils.ts              # shadcn/ui utilities
├── stores/
│   └── preferences.ts        # Zustand store for UI preferences
├── types/
│   └── index.ts              # TypeScript types
└── data/
    ├── bets_2025.json        # 2025 season predictions
    └── bets_2026.json        # 2026 season predictions
```

## Adding a New Season

1. Create `src/data/bets_YYYY.json` with participant predictions
2. Update `src/lib/bets.ts` to import and include the new file
3. Update `src/components/year-selector.tsx` to add the year to `AVAILABLE_YEARS`

