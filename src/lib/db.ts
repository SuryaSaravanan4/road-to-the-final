import { PrismaClient } from "@prisma/client";

// Pool size per Prisma client. `connection_limit=1` — a stale serverless
// recommendation still baked into many Neon/Vercel connection strings —
// serialises every query in a process behind a single connection. On Vercel
// that is masked (Fluid Compute runs several instances, each with its own
// client) but it bites hard on any single long-lived process: a `next start`
// server, a load generator, a container. Neon's pooled endpoint is PgBouncer,
// which multiplexes many client connections fine, so a small explicit pool is
// the safe default. Overridable via DB_CONNECTION_LIMIT.
const CONNECTION_LIMIT = process.env.DB_CONNECTION_LIMIT ?? "10";

// `DATABASE_URL` is a hosted Postgres (Neon) connection string in every
// environment — locally via .env.local, on Vercel via the Neon integration.
// The integration owns that value and can re-sync it, so instead of relying
// on a hand-edited `connection_limit` in the dashboard we force it here at
// client construction: whatever Neon injects, the runtime client gets the
// pool size we want. Migrations are unaffected — `prisma migrate deploy` in
// the build step reads DATABASE_URL_UNPOOLED through the CLI, not this module.
function runtimeDatabaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    url.searchParams.set("connection_limit", CONNECTION_LIMIT);
    // Prisma needs to know it's talking to a transaction pooler (it disables
    // prepared statements); Neon's pooled host is the "-pooler" one.
    if (/pooler/.test(url.hostname) && !url.searchParams.has("pgbouncer")) {
      url.searchParams.set("pgbouncer", "true");
    }
    return url.toString();
  } catch {
    // Not a parseable URL (shouldn't happen) — hand it to Prisma untouched.
    return raw;
  }
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const runtimeUrl = runtimeDatabaseUrl();
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient(runtimeUrl ? { datasourceUrl: runtimeUrl } : undefined);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
