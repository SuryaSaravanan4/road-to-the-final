-- CreateTable
CREATE TABLE "Competition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "sport" TEXT NOT NULL DEFAULT 'unknown',
    "format" TEXT NOT NULL,
    "teams" TEXT NOT NULL,
    "fixtures" TEXT NOT NULL,
    "standings" TEXT NOT NULL,
    "stageOrder" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Ingestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "competitionId" TEXT,
    "imageData" TEXT NOT NULL,
    "imageMediaType" TEXT NOT NULL,
    "rawExtraction" TEXT NOT NULL,
    "corrections" TEXT,
    "appliedDiff" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" DATETIME,
    CONSTRAINT "Ingestion_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
