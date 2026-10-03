-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "displayName" TEXT NOT NULL,
    "front" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "reviewFronts" TEXT NOT NULL DEFAULT '[]'
);

-- CreateTable
CREATE TABLE "Source" (
    "fileId" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "webUrl" TEXT NOT NULL,
    "modifiedAt" DATETIME NOT NULL,
    "versionOrHash" TEXT NOT NULL,
    "path" TEXT NOT NULL DEFAULT '',
    "parentIds" TEXT NOT NULL DEFAULT '[]',
    "kind" TEXT NOT NULL DEFAULT 'other',
    "syncStatus" TEXT NOT NULL DEFAULT 'processed',
    "statusReason" TEXT,
    "processedVersion" TEXT,
    "lastProcessedAt" DATETIME,
    "extractedText" TEXT,
    "meta" TEXT NOT NULL DEFAULT '{}',
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "nextStep" TEXT,
    "front" TEXT,
    "status" TEXT NOT NULL,
    "dueDate" TEXT,
    "priority" TEXT,
    "notes" TEXT,
    "blockedReason" TEXT,
    "origin" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ActivityOwner" (
    "activityId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,

    PRIMARY KEY ("activityId", "memberId"),
    CONSTRAINT "ActivityOwner_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ActivityOwner_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Reference" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "activityId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "versionOrHash" TEXT NOT NULL,
    "sheetOrSection" TEXT,
    "quoteOrCell" TEXT,
    "relationType" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Reference_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Reference_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "Source" ("fileId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Suggestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceFileId" TEXT NOT NULL,
    "sourceVersion" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "targetActivityId" TEXT,
    "proposedId" TEXT,
    "proposedFields" TEXT NOT NULL DEFAULT '{}',
    "currentSnapshot" TEXT,
    "evidence" TEXT NOT NULL,
    "evidenceLocator" TEXT,
    "reason" TEXT NOT NULL,
    "uncertainties" TEXT NOT NULL DEFAULT '[]',
    "front" TEXT,
    "reviewStatus" TEXT NOT NULL DEFAULT 'pending',
    "reviewerId" TEXT,
    "reviewedAt" DATETIME,
    "reviewNote" TEXT,
    "resultActivityId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Suggestion_sourceFileId_fkey" FOREIGN KEY ("sourceFileId") REFERENCES "Source" ("fileId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Suggestion_targetActivityId_fkey" FOREIGN KEY ("targetActivityId") REFERENCES "Activity" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DiscardedItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sourceFileId" TEXT NOT NULL,
    "sourceVersion" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "activityId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "before" TEXT,
    "after" TEXT,
    "changedFields" TEXT NOT NULL DEFAULT '[]',
    "reason" TEXT,
    "sourceFileId" TEXT,
    "suggestionId" TEXT,
    CONSTRAINT "ActivityEvent_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SyncState" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "folderId" TEXT,
    "folderName" TEXT,
    "folderPaths" TEXT NOT NULL DEFAULT '{}',
    "startPageToken" TEXT,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "runningSince" DATETIME,
    "lastSuccessAt" DATETIME,
    "lastErrorAt" DATETIME,
    "lastError" TEXT,
    "lastFullScanAt" DATETIME,
    "nextRunAt" DATETIME,
    "workerHeartbeatAt" DATETIME,
    "authorityIndexFileId" TEXT,
    "authorityFileId" TEXT,
    "authoritySheet" TEXT,
    "initialImportAt" DATETIME
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "mode" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "ignored" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "unavailable" INTEGER NOT NULL DEFAULT 0,
    "unchanged" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT
);

-- CreateTable
CREATE TABLE "SyncRequest" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "requestedBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handledAt" DATETIME
);

-- CreateTable
CREATE TABLE "GoogleToken" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "refreshTokenEnc" TEXT NOT NULL,
    "accountEmail" TEXT,
    "scope" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MemberVisit" (
    "memberId" TEXT NOT NULL PRIMARY KEY,
    "lastSeenAt" DATETIME NOT NULL,
    "previousSeenAt" DATETIME,
    CONSTRAINT "MemberVisit_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Suggestion_dedupeKey_key" ON "Suggestion"("dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "DiscardedItem_sourceFileId_sourceVersion_excerpt_key" ON "DiscardedItem"("sourceFileId", "sourceVersion", "excerpt");
