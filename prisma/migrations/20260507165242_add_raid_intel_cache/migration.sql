-- CreateTable
CREATE TABLE "CachedRaidIntel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameMode" TEXT NOT NULL,
    "reportedMap" TEXT,
    "reportedServer" TEXT,
    "reportedTime" TEXT,
    "reportedTimeType" TEXT,
    "reportCount" INTEGER,
    "goonsMap" TEXT,
    "goonsTimestamp" TEXT,
    "raidDurationMinutes" INTEGER,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "CachedRaidIntel_gameMode_key" ON "CachedRaidIntel"("gameMode");

-- CreateIndex
CREATE INDEX "CachedRaidIntel_gameMode_fetchedAt_idx" ON "CachedRaidIntel"("gameMode", "fetchedAt");
