-- CreateTable
CREATE TABLE "CacheEntry" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "payload" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
