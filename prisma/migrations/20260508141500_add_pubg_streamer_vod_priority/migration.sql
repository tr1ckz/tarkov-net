-- AlterTable
ALTER TABLE "PubgStreamerProfile" ADD COLUMN "vodsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PubgStreamerProfile" ADD COLUMN "vodsCheckedAt" DATETIME;
ALTER TABLE "PubgStreamerProfile" ADD COLUMN "lastVodAt" DATETIME;

-- CreateIndex
CREATE INDEX "PubgStreamerProfile_vodsEnabled_idx" ON "PubgStreamerProfile"("vodsEnabled");