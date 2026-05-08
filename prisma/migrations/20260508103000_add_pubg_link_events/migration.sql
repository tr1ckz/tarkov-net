-- CreateTable
CREATE TABLE "PubgLinkEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dedupeKey" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "pubgNameRaw" TEXT NOT NULL,
    "pubgNameNormalized" TEXT NOT NULL,
    "twitchUserId" TEXT NOT NULL,
    "twitchUserLogin" TEXT NOT NULL,
    "twitchUserName" TEXT NOT NULL,
    "twitchStreamId" TEXT,
    "twitchVideoId" TEXT,
    "shard" TEXT,
    "platform" TEXT,
    "encounterAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "PubgLinkEvent_dedupeKey_key" ON "PubgLinkEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "PubgLinkEvent_createdAt_idx" ON "PubgLinkEvent"("createdAt");

-- CreateIndex
CREATE INDEX "PubgLinkEvent_eventType_idx" ON "PubgLinkEvent"("eventType");

-- CreateIndex
CREATE INDEX "PubgLinkEvent_pubgNameNormalized_idx" ON "PubgLinkEvent"("pubgNameNormalized");

-- CreateIndex
CREATE INDEX "PubgLinkEvent_twitchUserId_idx" ON "PubgLinkEvent"("twitchUserId");

-- CreateIndex
CREATE INDEX "PubgLinkEvent_pubgNameNormalized_twitchUserId_idx" ON "PubgLinkEvent"("pubgNameNormalized", "twitchUserId");
