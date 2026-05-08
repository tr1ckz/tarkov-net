-- CreateTable
CREATE TABLE "CachedItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "iconLink" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CachedItemPrice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "gameMode" TEXT NOT NULL,
    "avg24hPrice" INTEGER,
    "lastLowPrice" INTEGER,
    "basePrice" INTEGER,
    "bestTraderName" TEXT,
    "bestTraderPrice" INTEGER,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CachedItemPrice_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CachedItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CachedPricePoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "gameMode" TEXT NOT NULL,
    "avg24hPrice" INTEGER,
    "lastLowPrice" INTEGER,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CachedPricePoint_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CachedItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CacheState" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "lastRefreshAt" DATETIME,
    "lastFullSyncAt" DATETIME,
    "lastSnapshotAt" DATETIME,
    "refreshInProgress" BOOLEAN NOT NULL DEFAULT false,
    "refreshStartedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "CachedItemPrice_gameMode_idx" ON "CachedItemPrice"("gameMode");

-- CreateIndex
CREATE INDEX "CachedItemPrice_itemId_idx" ON "CachedItemPrice"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "CachedItemPrice_itemId_gameMode_key" ON "CachedItemPrice"("itemId", "gameMode");

-- CreateIndex
CREATE INDEX "CachedPricePoint_itemId_gameMode_capturedAt_idx" ON "CachedPricePoint"("itemId", "gameMode", "capturedAt");

-- CreateIndex
CREATE INDEX "CachedPricePoint_gameMode_capturedAt_idx" ON "CachedPricePoint"("gameMode", "capturedAt");
