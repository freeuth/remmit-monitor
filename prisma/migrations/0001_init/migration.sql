-- CreateTable
CREATE TABLE "ComparisonSession" (
    "id" SERIAL NOT NULL,
    "triggeredAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "triggeredBy" TEXT NOT NULL DEFAULT 'manual',
    "toCurrency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "quotesCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ComparisonSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "collectedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "service" TEXT NOT NULL,
    "fromCurrency" TEXT NOT NULL DEFAULT 'KRW',
    "toCurrency" TEXT NOT NULL,
    "sendAmountKrw" INTEGER NOT NULL,
    "exchangeRate" DOUBLE PRECISION,
    "feeKrw" INTEGER,
    "recipientAmount" DOUBLE PRECISION NOT NULL,
    "recipientCurrency" TEXT NOT NULL,
    "rawSnapshot" TEXT,
    "notes" TEXT,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Quote_toCurrency_sendAmountKrw_collectedAt_idx" ON "Quote"("toCurrency", "sendAmountKrw", "collectedAt");

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ComparisonSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
