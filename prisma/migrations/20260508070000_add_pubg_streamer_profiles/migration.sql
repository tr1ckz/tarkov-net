-- CreateTable
CREATE TABLE "PubgStreamerProfile" (
    "twitchUserId" TEXT NOT NULL PRIMARY KEY,
    "userLogin" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "normalizedLogin" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenLiveAt" DATETIME,
    "isLive" BOOLEAN NOT NULL DEFAULT false,
    "lastStreamId" TEXT,
    "lastTitle" TEXT,
    "lastGameId" TEXT,
    "lastStreamStartAt" DATETIME,
    "indexedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "PubgStreamerProfile_isLive_idx" ON "PubgStreamerProfile"("isLive");

-- CreateIndex
CREATE INDEX "PubgStreamerProfile_lastSeenAt_idx" ON "PubgStreamerProfile"("lastSeenAt");

-- CreateIndex
CREATE INDEX "PubgStreamerProfile_normalizedLogin_idx" ON "PubgStreamerProfile"("normalizedLogin");

-- CreateIndex
CREATE INDEX "PubgStreamerProfile_normalizedName_idx" ON "PubgStreamerProfile"("normalizedName");
