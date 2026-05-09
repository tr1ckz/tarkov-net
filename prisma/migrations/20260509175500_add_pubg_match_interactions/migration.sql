-- CreateTable
CREATE TABLE "PubgMatchInteraction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dedupeKey" TEXT NOT NULL,
    "twitchUserId" TEXT NOT NULL,
    "twitchUserLogin" TEXT NOT NULL,
    "twitchUserName" TEXT NOT NULL,
    "streamerPubgPlayerId" TEXT NOT NULL,
    "streamerPubgPlayerName" TEXT NOT NULL,
    "counterpartyPubgPlayerId" TEXT,
    "counterpartyPubgNameRaw" TEXT NOT NULL,
    "counterpartyPubgNameNormalized" TEXT NOT NULL,
    "interactionType" TEXT NOT NULL,
    "interactionTitle" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "shard" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "matchCreatedAt" DATETIME,
    "encounterAt" DATETIME,
    "twitchVideoId" TEXT NOT NULL,
    "vodOffsetSeconds" INTEGER NOT NULL DEFAULT 0,
    "weapon" TEXT,
    "distanceMeters" INTEGER,
    "mapTag" TEXT,
    "gameModeTag" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "PubgMatchInteraction_dedupeKey_key" ON "PubgMatchInteraction"("dedupeKey");

-- CreateIndex
CREATE INDEX "PubgMatchInteraction_counterpartyPubgNameNormalized_idx" ON "PubgMatchInteraction"("counterpartyPubgNameNormalized");

-- CreateIndex
CREATE INDEX "PubgMatchInteraction_counterpartyPubgPlayerId_idx" ON "PubgMatchInteraction"("counterpartyPubgPlayerId");

-- CreateIndex
CREATE INDEX "PubgMatchInteraction_platform_shard_idx" ON "PubgMatchInteraction"("platform", "shard");

-- CreateIndex
CREATE INDEX "PubgMatchInteraction_encounterAt_idx" ON "PubgMatchInteraction"("encounterAt");

-- CreateIndex
CREATE INDEX "PubgMatchInteraction_twitchUserId_createdAt_idx" ON "PubgMatchInteraction"("twitchUserId", "createdAt");
