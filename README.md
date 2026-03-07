# F1 Betting Tracker

Track F1 season prediction bets among friends. Participants predict driver and constructor standings before the season, and the app scores predictions as races complete.

## Development

```bash
pnpm install
pnpm dev
```

## Deployment

### KV Namespaces

Create two KV namespaces for caching:

```bash
wrangler kv namespace create F1_DRIVER_NAMES
wrangler kv namespace create F1_RACE_RESULTS
```

### Environment Variables (Optional)

OpenF1 API credentials for higher rate limits and live standings during races:

```bash
wrangler secret put OPENF1_USERNAME
wrangler secret put OPENF1_PASSWORD
```

For local development, add to `.dev.vars`:

```bash
OPENF1_USERNAME=your_username
OPENF1_PASSWORD=your_password
```

The app works without credentials but may hit rate limits during heavy use.

### Deploy

```bash
pnpm build
pnpm deploy
```

## Adding Bets

Create/edit `src/data/bets_YYYY.json`:

```json
{
  "Participant Name": {
    "drivers": ["Max Verstappen", "Lewis Hamilton", ...],
    "constructors": ["Red Bull Racing", "Mercedes", ...]
  }
}
```

Driver/constructor names should match OpenF1 API names. The app shows warnings for mismatches.
