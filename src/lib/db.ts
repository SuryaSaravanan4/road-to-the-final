import { PrismaClient } from "@prisma/client";

// `DATABASE_URL` is a hosted Postgres (Neon) connection string in every
// environment — locally via .env.local, on Vercel via the Neon integration.
// Schema is applied by `prisma migrate deploy` in the build step, not lazily
// at runtime.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
