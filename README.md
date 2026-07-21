# Road to the Final

Tracks, for a team you follow, every remaining scenario to reach the final of
their tournament — ranked easiest to hardest. Currently configured for the
USA men's national team at the 2026 FIFA World Cup, but architected so a new
sport/league is just a new provider, not a rewrite.

## How it works

1. **Ground-truth data** comes from a real sports API (see below) — never
   from an LLM guessing at scores or bracket positions.
2. That data is cached in SQLite with a ~15 minute TTL (`src/lib/cache.ts`),
   so the upstream API is hit at most once per TTL window, not on every page
   load.
3. **Claude** is used only as a reasoning layer: given the already-fetched
   standings/fixtures, it assesses each realistic remaining opponent's
   difficulty and likelihood as structured, schema-validated JSON
   (`src/reasoning/`). It never invents teams, scores, or bracket positions.
4. A pure, unit-tested function (`src/lib/scenario-ranking.ts`) sorts those
   scenarios easiest → hardest and assigns ranks — deterministic code, not
   LLM output, decides the ordering.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Get API keys

- **football-data.org** (sports data, free tier) — register at
  https://www.football-data.org/client/register (instant, email-based, no
  card required). Free tier includes the FIFA World Cup competition (`WC`)
  with standings, fixtures, and knockout-stage data.
- **Anthropic API key** (reasoning layer) — create one at
  https://console.anthropic.com/settings/keys

### 3. Configure environment

Copy the example file and fill in your keys:

```bash
cp .env.local.example .env.local
```

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Defaults to a local SQLite file, no changes needed |
| `FOOTBALL_DATA_API_KEY` | yes | From step 2 |
| `ANTHROPIC_API_KEY` | yes | From step 2 |
| `ANTHROPIC_MODEL` | no | Defaults to `claude-sonnet-5` |
| `TRACKED_PROVIDER_KEY` | no | Defaults to `soccer/world-cup-2026` |
| `TRACKED_TEAM_ID` | yes | football-data.org numeric team ID (see below) |
| `TRACKED_TEAM_NAME` | no | Display name, defaults to `United States` |
| `CRON_SECRET` | no | If set, required as a bearer token to call `/api/cron` |

**Finding `TRACKED_TEAM_ID`:** football-data.org's World Cup team list
populates as the competition's squads are confirmed. Once you have an API
key, run:

```bash
curl -H "X-Auth-Token: YOUR_KEY" https://api.football-data.org/v4/competitions/WC/teams
```

and find the numeric `id` for your team in the response.

### 4. Set up the database

```bash
npm run db:migrate
```

This creates a local SQLite file and the cache table Prisma needs.

### 5. Run it

```bash
npm run dev
```

Open http://localhost:3000. Until `TRACKED_TEAM_ID` and both API keys are
set, the app shows a clear error state rather than failing silently.

## Keeping data fresh

The app fetches on-demand with a 15-minute cache TTL — no page load ever
waits on a fresh upstream call more often than that, and a manual "Refresh"
button forces an immediate re-fetch.

For proactive background refreshing, `src/app/api/cron/route.ts` is a
pingable endpoint that forces a refresh. `vercel.json` wires it to Vercel
Cron every 15 minutes (Vercel Cron on a paid plan; the Hobby tier only
allows daily crons). On Hobby/free hosting, use a free external scheduler
instead, e.g. a GitHub Actions workflow:

```yaml
on:
  schedule:
    - cron: "*/15 * * * *"
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: curl -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" https://your-app.vercel.app/api/cron
```

## Tracking a competition from a screenshot

Informal competitions with no API — a bracket that exists only as a photo —
can be ingested at `/competitions` → "From screenshot":

1. Upload the image. Claude vision transcribes it into schema-validated
   structured data (rounds, matchups, names, scores, dates) with a
   per-field confidence. It never invents what it can't see.
2. Review the editable preview: low-confidence fields are flagged
   "needs review", and if the format (single-elim, double-elim,
   round-robin, groups+knockout) couldn't be detected confidently you must
   pick it before anything else unlocks. **Nothing becomes competition data
   until you confirm.**
3. Once confirmed, the bracket is ground truth exactly like an official
   provider's: the same reasoning, ranking, and UI run on it unmodified.
   Upload a later screenshot ("Update from screenshot") to add new results —
   changes to already-confirmed data are shown as an explicit diff with
   conflicts called out, never silently overwritten.

Design decisions, format support, and the security/accessibility posture
are recorded in `docs/adr/0001-screenshot-bracket-ingestion.md`.

### Is the "needs review" flag worth anything?

Each ingestion stores what Claude read (with a confidence per field) next to
what the human confirmed, so the two can be compared after the fact:

```bash
npm run calibration           # summary
npm run calibration -- --edits  # plus every individual correction
```

It reports how often humans actually corrected each field type, whether
confidence predicts those corrections at all (an AUC of 0.5 means it does
not), and how the live `CONFIDENCE_CONFIRM_THRESHOLD` performs as an error
detector — how much of the flagged work was worth doing, and how many wrong
values sailed through unflagged into ground truth. The comparison baseline is
what the confirmation preview would have submitted untouched, so its
auto-filled round names, trimming, and winner round-trip are never miscounted
as human corrections (`src/lib/calibration.ts`).

The numbers only mean something once a real number of brackets have been
confirmed; with a handful of ingestions treat it as a smoke test.

**⚠ Durability:** screenshot competitions are stored in the database and are
*not re-fetchable from anywhere*. On Vercel, the default SQLite-in-`/tmp`
setup (see "Deploying to Vercel" below) is wiped on cold starts — fine for
the cache, **fatal for ingested competitions**. If you deploy screenshot
ingestion anywhere serverless, point `DATABASE_URL` at a persistent
database (Neon, Turso, Vercel Postgres, or any host with a real disk).

**⚠ No accounts yet:** Phase 1 has no user model — ingestion and
confirmation are unauthenticated, so treat a deployment as single-tenant
and don't expose it publicly if that matters. Uploads are validated by
actual image content (not claimed MIME type) and extraction calls are
rate-limited, but authentication is deliberately deferred to Phase 2.

## Adding a new sport/league

1. Implement `SportsProvider` (`src/providers/SportsProvider.ts`) for the
   new data source — see `src/providers/football-data-org/` as the
   reference implementation.
2. Register it with a stable key in `src/providers/registry.ts`.
3. Point `TRACKED_PROVIDER_KEY` at the new key.

Nothing in the caching, reasoning, or UI layers needs to change — they all
depend only on the `SportsProvider` interface and the shared domain types in
`src/types/domain.ts`.

## Testing

```bash
npm test
```

Covers scenario ranking, stage ordering and elimination rules (single- and
double-elimination), the `road-to-final` orchestration (confirmed-opponent
short-circuit, elimination, provider stage order), the screenshot pipeline's
pure logic (extraction schema rejection, corrected-draft conversion,
re-ingestion diff/merge), the confidence-calibration pairing (which preview
normalizations must not count as human corrections, and the metrics over
them), and the upload security validations (image sniffing, rate limiting,
origin checks).

## Deploying to Vercel

Push to a GitHub repo, import it in Vercel, and set the same environment
variables from `.env.local` in the Vercel project settings.

**Known limitation:** Vercel's serverless functions have a read-only
filesystem except `/tmp`, and `/tmp` is not shared across function
instances or persisted between invocations. The default `DATABASE_URL` from
`.env.local` (a repo-relative path) isn't writable there at all, so
`src/lib/db.ts` detects `VERCEL` and automatically points `DATABASE_URL` at
`/tmp` instead, and `src/lib/cache.ts` (re)creates the cache table lazily
since `/tmp` is wiped on every cold start. That means the SQLite cache works
perfectly and durably for `npm run dev` and for any persistent host (a VPS,
a Docker container, Railway/Fly.io, etc.); on Vercel it still works, but as
a best-effort, per-instance cache — you'll get correct data, just with more
upstream API calls than the TTL implies once traffic spans multiple cold
starts. If you deploy to Vercel and start hitting football-data.org's rate
limit, switch `DATABASE_URL` to a hosted Postgres/SQLite-compatible database
(e.g. Vercel Postgres, Neon, or Turso) — the only change needed is the
`datasource` block in `prisma/schema.prisma` and the connection string;
`src/lib/cache.ts` and everything above it is unaffected.
