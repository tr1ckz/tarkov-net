-- CreateTable
CREATE TABLE "PubgKnownPlayer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playerName" TEXT NOT NULL,
    "playerNameLower" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "shard" TEXT NOT NULL,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seenCount" INTEGER NOT NULL DEFAULT 1
);

-- CreateIndex
CREATE INDEX "PubgKnownPlayer_playerNameLower_idx" ON "PubgKnownPlayer"("playerNameLower");

-- CreateIndex
CREATE INDEX "PubgKnownPlayer_platform_shard_idx" ON "PubgKnownPlayer"("platform", "shard");

-- CreateIndex
CREATE INDEX "PubgKnownPlayer_lastSeenAt_idx" ON "PubgKnownPlayer"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "PubgKnownPlayer_playerName_platform_shard_key" ON "PubgKnownPlayer"("playerName", "platform", "shard");
