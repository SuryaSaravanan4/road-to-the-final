-- CreateTable
CREATE TABLE "ScenarioFeedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ScenarioFeedback_providerKey_teamId_stage_opponentId_key" ON "ScenarioFeedback"("providerKey", "teamId", "stage", "opponentId");
