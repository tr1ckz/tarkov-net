-- CreateTable
CREATE TABLE "PubgIdentityValidationQueue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "identityLinkId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lastError" TEXT,
    "queuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "nextAttemptAt" DATETIME,
    "lastValidatedPubgId" TEXT,
    "lastValidatedPubgName" TEXT,
    "lastValidatedShard" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "PubgIdentityValidationQueue_status_queuedAt_idx" ON "PubgIdentityValidationQueue"("status", "queuedAt");

-- CreateIndex
CREATE INDEX "PubgIdentityValidationQueue_nextAttemptAt_idx" ON "PubgIdentityValidationQueue"("nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "PubgIdentityValidationQueue_identityLinkId_key" ON "PubgIdentityValidationQueue"("identityLinkId");
