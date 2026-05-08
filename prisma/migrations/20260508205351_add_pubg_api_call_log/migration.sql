-- CreateTable
CREATE TABLE "PubgApiCallLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "callType" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "shard" TEXT,
    "statusCode" INTEGER,
    "durationMs" INTEGER,
    "success" BOOLEAN NOT NULL,
    "triggeredBy" TEXT,
    "calledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "PubgApiCallLog_calledAt_idx" ON "PubgApiCallLog"("calledAt");

-- CreateIndex
CREATE INDEX "PubgApiCallLog_callType_idx" ON "PubgApiCallLog"("callType");

-- CreateIndex
CREATE INDEX "PubgApiCallLog_success_idx" ON "PubgApiCallLog"("success");

-- CreateIndex
CREATE INDEX "PubgApiCallLog_triggeredBy_idx" ON "PubgApiCallLog"("triggeredBy");
