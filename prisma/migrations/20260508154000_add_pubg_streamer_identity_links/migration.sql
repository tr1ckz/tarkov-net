-- CreateTable
CREATE TABLE "PubgStreamerIdentityLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "twitchUserId" TEXT NOT NULL,
    "twitchUserLogin" TEXT NOT NULL,
    "twitchUserName" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "shard" TEXT NOT NULL,
    "pubgPlayerId" TEXT NOT NULL,
    "pubgPlayerName" TEXT NOT NULL,
    "pubgNameNormalized" TEXT NOT NULL,
    "confidenceScore" INTEGER NOT NULL DEFAULT 0,
    "confidenceReasonsJson" TEXT,
    "source" TEXT NOT NULL DEFAULT 'encounter_match',
    "firstLinkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLinkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "PubgStreamerIdentityLink_twitchUserId_platform_key" ON "PubgStreamerIdentityLink"("twitchUserId", "platform");

-- CreateIndex
CREATE INDEX "PubgStreamerIdentityLink_pubgPlayerId_idx" ON "PubgStreamerIdentityLink"("pubgPlayerId");

-- CreateIndex
CREATE INDEX "PubgStreamerIdentityLink_pubgNameNormalized_idx" ON "PubgStreamerIdentityLink"("pubgNameNormalized");

-- CreateIndex
CREATE INDEX "PubgStreamerIdentityLink_lastLinkedAt_idx" ON "PubgStreamerIdentityLink"("lastLinkedAt");
