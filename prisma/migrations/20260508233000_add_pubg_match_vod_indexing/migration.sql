-- CreateTable
CREATE TABLE "PubgStreamerMatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "twitchUserId" TEXT NOT NULL,
    "twitchUserLogin" TEXT NOT NULL,
    "twitchUserName" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "shard" TEXT NOT NULL,
    "pubgPlayerId" TEXT NOT NULL,
    "pubgPlayerName" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "matchCreatedAt" DATETIME,
    "mapName" TEXT,
    "gameMode" TEXT,
    "telemetryUrl" TEXT,
    "source" TEXT NOT NULL DEFAULT 'eventsub_stream_online',
    "indexedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PubgStreamerVod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "twitchUserId" TEXT NOT NULL,
    "twitchUserLogin" TEXT NOT NULL,
    "twitchUserName" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "durationSeconds" INTEGER NOT NULL,
    "createdAtTwitch" DATETIME,
    "publishedAtTwitch" DATETIME,
    "indexedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PubgMatchVodLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "twitchUserId" TEXT NOT NULL,
    "twitchUserLogin" TEXT NOT NULL,
    "twitchUserName" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "matchCreatedAt" DATETIME,
    "vodStartedAt" DATETIME,
    "vodOffsetSeconds" INTEGER NOT NULL DEFAULT 0,
    "deltaSeconds" INTEGER NOT NULL DEFAULT 0,
    "confidenceTag" TEXT NOT NULL DEFAULT 'unknown',
    "linkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "PubgStreamerMatch_twitchUserId_matchId_key" ON "PubgStreamerMatch"("twitchUserId", "matchId");

-- CreateIndex
CREATE INDEX "PubgStreamerMatch_twitchUserId_indexedAt_idx" ON "PubgStreamerMatch"("twitchUserId", "indexedAt");

-- CreateIndex
CREATE INDEX "PubgStreamerMatch_matchCreatedAt_idx" ON "PubgStreamerMatch"("matchCreatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PubgStreamerVod_videoId_key" ON "PubgStreamerVod"("videoId");

-- CreateIndex
CREATE INDEX "PubgStreamerVod_twitchUserId_createdAtTwitch_idx" ON "PubgStreamerVod"("twitchUserId", "createdAtTwitch");

-- CreateIndex
CREATE UNIQUE INDEX "PubgMatchVodLink_twitchUserId_matchId_key" ON "PubgMatchVodLink"("twitchUserId", "matchId");

-- CreateIndex
CREATE INDEX "PubgMatchVodLink_videoId_idx" ON "PubgMatchVodLink"("videoId");

-- CreateIndex
CREATE INDEX "PubgMatchVodLink_linkedAt_idx" ON "PubgMatchVodLink"("linkedAt");
