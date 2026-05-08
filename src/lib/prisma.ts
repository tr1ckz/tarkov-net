import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

const prismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
  });

let sqliteInitPromise: Promise<void> | null = null;
let sqliteInitialized = false;

async function ensureSqlitePragmas() {
  if (sqliteInitialized) {
    return;
  }

  if (!sqliteInitPromise) {
    sqliteInitPromise = (async () => {
      const databaseUrl = process.env.DATABASE_URL ?? "";
      if (!databaseUrl.startsWith("file:")) {
        sqliteInitialized = true;
        return;
      }

      try {
        // These pragmas reduce write-lock contention for SQLite under concurrent API traffic.
        await prismaClient.$queryRawUnsafe("PRAGMA journal_mode = WAL");
        await prismaClient.$queryRawUnsafe("PRAGMA synchronous = NORMAL");
        await prismaClient.$queryRawUnsafe("PRAGMA busy_timeout = 15000");
      } catch (error) {
        console.error("Failed to initialize SQLite pragmas", error);
      } finally {
        sqliteInitialized = true;
      }
    })();
  }

  await sqliteInitPromise;
}

export const prisma = prismaClient.$extends({
  query: {
    $allModels: {
      async $allOperations({ args, query }) {
        await ensureSqlitePragmas();
        return query(args);
      }
    }
  }
});

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prismaClient;
}
