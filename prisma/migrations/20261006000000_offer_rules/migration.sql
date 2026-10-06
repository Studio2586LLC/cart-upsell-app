ALTER TABLE "CartUpsellSettings"
ADD COLUMN "excludedProductIds" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN "minPrice" DOUBLE PRECISION,
ADD COLUMN "maxPrice" DOUBLE PRECISION,
ADD COLUMN "buttonLabel" TEXT,
ADD COLUMN "imageSize" INTEGER,
ADD COLUMN "itemGap" INTEGER,
ADD COLUMN "holdoutPercent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "experimentId" TEXT;

CREATE TABLE "ExperimentAssignment" (
  "id" TEXT NOT NULL,
  "shop" TEXT NOT NULL,
  "experimentId" TEXT NOT NULL,
  "visitorId" TEXT NOT NULL,
  "cohort" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExperimentAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExperimentAssignment_shop_experimentId_visitorId_key"
ON "ExperimentAssignment"("shop", "experimentId", "visitorId");
CREATE INDEX "ExperimentAssignment_shop_experimentId_cohort_createdAt_idx"
ON "ExperimentAssignment"("shop", "experimentId", "cohort", "createdAt");

CREATE TABLE "OrderAttribution" (
  "id" TEXT NOT NULL,
  "shop" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "experimentId" TEXT,
  "cohort" TEXT,
  "amount" DOUBLE PRECISION NOT NULL,
  "currency" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderAttribution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderAttribution_shop_orderId_key"
ON "OrderAttribution"("shop", "orderId");
CREATE INDEX "OrderAttribution_shop_experimentId_cohort_createdAt_idx"
ON "OrderAttribution"("shop", "experimentId", "cohort", "createdAt");
