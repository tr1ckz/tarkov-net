-- CreateTable
CREATE TABLE "PubgMapConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mapSlug" TEXT NOT NULL,
    "calibrationJson" TEXT,
    "entitiesJson" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "PubgMapConfig_mapSlug_key" ON "PubgMapConfig"("mapSlug");

-- CreateIndex
CREATE INDEX "PubgMapConfig_mapSlug_idx" ON "PubgMapConfig"("mapSlug");
