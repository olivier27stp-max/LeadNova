import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const connectionString = process.env.DATABASE_TCP_URL;
  if (!connectionString) {
    // During build time, return a dummy client that will fail at runtime
    // This prevents build errors when env vars are not available
    if (process.env.NODE_ENV === "production" && typeof window === "undefined") {
      console.warn("DATABASE_TCP_URL not set - Prisma client will not be functional");
    }
    throw new Error("DATABASE_TCP_URL environment variable is not set");
  }
  const pool = new pg.Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30000,
    ssl: { rejectUnauthorized: false },
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

// Lazy initialization - only create client when first used
let _prisma: PrismaClient | undefined;

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    if (!_prisma) {
      _prisma = globalForPrisma.prisma ?? createPrismaClient();
      if (process.env.NODE_ENV !== "production") {
        globalForPrisma.prisma = _prisma;
      }
    }
    const value = (_prisma as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof value === "function") return value.bind(_prisma);
    return value;
  },
});
