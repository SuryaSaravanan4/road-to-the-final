-- CreateTable
CREATE TABLE "CacheEntry" (
    "key" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CacheEntry_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Competition" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sport" TEXT NOT NULL DEFAULT 'unknown',
    "format" TEXT NOT NULL,
    "ratingSystem" TEXT,
    "teams" TEXT NOT NULL,
    "fixtures" TEXT NOT NULL,
    "standings" TEXT NOT NULL,
    "stageOrder" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Competition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScenarioFeedback" (
    "id" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "opponentId" TEXT NOT NULL,
    "opponentName" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "likelihood" INTEGER NOT NULL,
    "reasoning" TEXT NOT NULL,
    "model" TEXT,
    "promptVersion" TEXT,
    "verdict" TEXT NOT NULL,
    "difficultyCorrection" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScenarioFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ingestion" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT,
    "imageData" TEXT NOT NULL,
    "imageMediaType" TEXT NOT NULL,
    "rawExtraction" TEXT NOT NULL,
    "corrections" TEXT,
    "appliedDiff" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "discardReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "discardedAt" TIMESTAMP(3),

    CONSTRAINT "Ingestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScenarioFeedback_providerKey_teamId_stage_opponentId_key" ON "ScenarioFeedback"("providerKey", "teamId", "stage", "opponentId");

-- AddForeignKey
ALTER TABLE "Ingestion" ADD CONSTRAINT "Ingestion_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
