-- AlterTable
ALTER TABLE "PubgMapConfig" ADD COLUMN "legendJson" TEXT;
ALTER TABLE "PubgMapConfig" ADD COLUMN "mapImageUrl" TEXT;

-- CreateTable
CREATE TABLE "PubgActiveStreamer" (
    "twitchUserId" TEXT NOT NULL PRIMARY KEY,
    "streamId" TEXT NOT NULL,
    "userLogin" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "streamStartedAt" DATETIME NOT NULL,
    "title" TEXT NOT NULL,
    "normalizedLogin" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "indexedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "PubgActiveStreamer_streamId_key" ON "PubgActiveStreamer"("streamId");

-- CreateIndex
CREATE UNIQUE INDEX "PubgActiveStreamer_userLogin_key" ON "PubgActiveStreamer"("userLogin");

-- CreateIndex
CREATE INDEX "PubgActiveStreamer_indexedAt_idx" ON "PubgActiveStreamer"("indexedAt");

-- CreateIndex
CREATE INDEX "PubgActiveStreamer_normalizedLogin_idx" ON "PubgActiveStreamer"("normalizedLogin");

-- CreateIndex
CREATE INDEX "PubgActiveStreamer_normalizedName_idx" ON "PubgActiveStreamer"("normalizedName");
