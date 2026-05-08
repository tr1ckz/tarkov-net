-- CreateTable
CREATE TABLE "PubgLinkRunLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "playerName" TEXT,
    "platform" TEXT,
    "requestedShard" TEXT,
    "resolvedShard" TEXT,
    "encountersFound" INTEGER NOT NULL DEFAULT 0,
    "clipsReturned" INTEGER NOT NULL DEFAULT 0,
    "activeIndexMatches" INTEGER NOT NULL DEFAULT 0,
    "activeOverlapMatches" INTEGER NOT NULL DEFAULT 0,
    "directLoginMatches" INTEGER NOT NULL DEFAULT 0,
    "searchChannelMatches" INTEGER NOT NULL DEFAULT 0,
    "vodMoments" INTEGER NOT NULL DEFAULT 0,
    "channelsWithClips" INTEGER NOT NULL DEFAULT 0,
    "linkEventsQueued" INTEGER NOT NULL DEFAULT 0,
    "linkEventsPersisted" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "PubgLinkRunLog_createdAt_idx" ON "PubgLinkRunLog"("createdAt");

-- CreateIndex
CREATE INDEX "PubgLinkRunLog_source_idx" ON "PubgLinkRunLog"("source");

-- CreateIndex
CREATE INDEX "PubgLinkRunLog_status_idx" ON "PubgLinkRunLog"("status");
