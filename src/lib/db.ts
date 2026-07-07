import { PrismaClient } from "@prisma/client";

// Vercel's serverless filesystem is read-only outside /tmp, so the
// repo-relative DATABASE_URL from .env.local (e.g. "file:./dev.db") isn't
// writable there — the first cache read would throw. /tmp is writable but
// ephemeral (wiped between cold starts, not shared across instances), so
// this is a best-effort per-instance cache on Vercel, not a durable one;
// see cache.ts's ensureSchema for the corresponding lazy table creation.
if (process.env.VERCEL && !process.env.DATABASE_URL?.startsWith("file:/tmp")) {
  process.env.DATABASE_URL = "file:/tmp/road-to-the-final-cache.db";
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
