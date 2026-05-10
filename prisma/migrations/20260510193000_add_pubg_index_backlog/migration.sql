-- CreateTable
CREATE TABLE "PubgIndexBacklog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "twitchUserId" TEXT NOT NULL,
    "twitchUserLogin" TEXT NOT NULL,
    "twitchUserName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAttemptAt" DATETIME,
    "resolvedAt" DATETIME,
    "resolutionNote" TEXT,
    "platformHint" TEXT,
    "shardHint" TEXT,
    "pubgPlayerNameHint" TEXT,
    "identityLinkId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "PubgIndexBacklog_twitchUserId_key" ON "PubgIndexBacklog"("twitchUserId");

-- CreateIndex
CREATE INDEX "PubgIndexBacklog_status_lastSeenAt_idx" ON "PubgIndexBacklog"("status", "lastSeenAt");

-- CreateIndex
CREATE INDEX "PubgIndexBacklog_lastAttemptAt_idx" ON "PubgIndexBacklog"("lastAttemptAt");
