# Road to the Final

Tracks, for a team you follow, every remaining scenario to reach the final of
their tournament — ranked easiest to hardest. Currently configured for the
USA men's national team at the 2026 FIFA World Cup, but architected so a new
sport/league is just a new provider, not a rewrite.

## How it works

1. **Ground-truth data** comes from a real sports API (see below) — never
   from an LLM guessing at scores or bracket positions.
2. That data is cached in Postgres with a ~15 minute TTL (`src/lib/cache.ts`),
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
| `DATABASE_URL` | yes | Postgres connection string (Neon locally and on Vercel); `DATABASE_URL_UNPOOLED` is also needed for migrations |
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

This applies the Prisma migrations (CacheEntry, Competition, Ingestion,
ScenarioFeedback) to the Postgres database in `DATABASE_URL`.

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

For proactive background refreshing, `src/app/api/cron/route.ts` forces a
refresh when pinged. Two schedulers hit it:

- **`vercel.json`** wires it to Vercel Cron once daily (`0 8 * * *`) — the
  Hobby tier caps Vercel Cron at one run per day regardless of the
  expression, so this is the zero-dependency baseline.
- **`.github/workflows/refresh.yml`** runs the real 15-minute cadence by
  curling the same endpoint on a GitHub Actions schedule, sending
  `CRON_SECRET` as a bearer token (and a Vercel protection-bypass header if
  deployment protection is enabled). Set the `PROD_URL`, `CRON_SECRET`, and
  optional `VERCEL_BYPASS_SECRET` repo secrets to activate it.

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
   until you confirm** — and if a read is too wrong to be worth fixing,
   "Discard this read" records that (with an optional reason) instead of
   silently throwing the extraction away.
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
as human corrections (`src/lib/calibration.ts`). Drafts that were *discarded*
rather than confirmed are listed too, with any reason given — the negative
signal that an extraction wasn't worth correcting at all.

The numbers only mean something once a real number of brackets have been
confirmed; with a handful of ingestions treat it as a smoke test.

**⚠ Durability:** screenshot competitions are stored in the database and are
*not re-fetchable from anywhere*. `DATABASE_URL` must point at a persistent
Postgres (Neon in this project) — never an ephemeral store — or confirmed
ingestions are lost.

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

## Performance

The ranking endpoint (`GET /api/path`) was load-tested on the live Vercel
deployment against a screenshot-ingested 8-team bracket mid-tournament
(quarter-finals complete, semi-finals drawn, final undecided), so every
response exercises all three code paths at once: a finished round, a
bracket-confirmed opponent, and a Claude-reasoned scenario set for the
still-open slot.

- **Tool:** [autocannon](https://github.com/mcollina/autocannon) 8.0, run
  from a residential connection against the production alias.
- **Server:** Vercel Hobby, function region `iad1`; Neon Postgres (free tier)
  in `us-east-1`.
- **State:** the 15-minute cache was pre-warmed before each run, so
  steady-state requests are served from the `CacheEntry` table — two to three
  indexed reads, a `JSON.parse`, and the deterministic ranking sort. The
  Claude reasoning call (~2–3 s) fires only on the first request after a TTL
  expiry and is **not** represented in the percentiles below.
- Single runs of 10–30 s each, not averaged.

| Concurrent connections | Requests | p50 | p95 | p99 | Throughput |
|---|---|---|---|---|---|
| 1   | 60 in 10 s   | 162 ms | 243 ms | 252 ms | ~6 req/s   |
| 20  | 4.0k in 30 s | 140 ms | 209 ms | 300 ms | ~143 req/s |
| 50  | 7.0k in 20 s | 133 ms | 216 ms | 292 ms | ~371 req/s |
| 100 | 13k in 20 s  | 154 ms | 279 ms | 358 ms | ~630 req/s |

Reproduce:

```bash
npx autocannon -c 20 -d 30 \
  "https://<deployment>/api/path?provider=screenshot/<competitionId>&teamId=<teamId>"
```

### What this measures — and what it doesn't

- **It's the warm-read path.** p50 is a couple of `CacheEntry` selects
  against Neon plus JSON parsing plus the ranking sort (which is itself
  sub-millisecond — see `tests/scenario-ranking.test.ts`). Roughly 20–40 ms
  of every figure above is residential-client ↔ `iad1` round-trip, not server
  work.
- **No before/after improvement is claimed.** The one change made for
  performance — `src/lib/db.ts` forcing the Prisma pool off the
  `connection_limit=1` that ships in the Neon/Vercel connection string — is
  decisive for a single long-lived process (locally, 20-connection p50 went
  **7.6 s → 0.74 s**) but made no measurable difference on Vercel, where
  Fluid Compute already runs several function instances, each with its own
  client and connection:

  | 20 connections | `connection_limit=1` | `connection_limit=10` |
  |---|---|---|
  | p50        | 126 ms      | 140 ms      |
  | p95        | 193 ms      | 209 ms      |
  | throughput | ~162 req/s  | ~143 req/s  |

  The two deploys land within run-to-run noise (~±25 ms p50, ~±20 %
  throughput on Hobby + free-tier Neon). The change was kept because it is
  correct for non-serverless hosting, not because it moved these numbers.

## Deploying to Vercel

The project is linked to a Vercel project with the Neon Postgres integration,
which provisions `DATABASE_URL` / `DATABASE_URL_UNPOOLED` automatically. The
remaining variables from `.env.local` (`FOOTBALL_DATA_API_KEY`,
`ANTHROPIC_API_KEY`, `TRACKED_TEAM_ID`, and any optional ones) must be added
with `vercel env add <NAME> production`.

The build command (`package.json`) runs `prisma generate && prisma migrate
deploy && next build`, so every production deploy applies pending migrations
to Neon before building. `prisma migrate deploy` connects over
`DATABASE_URL_UNPOOLED` (PgBouncer's transaction pooling can't hold the
advisory locks migrations need); app queries use the pooled `DATABASE_URL`.

Deploy with `vercel --prod`.
