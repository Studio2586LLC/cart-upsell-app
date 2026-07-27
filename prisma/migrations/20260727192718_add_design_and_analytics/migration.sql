-- AlterTable
ALTER TABLE "CartUpsellSettings" ADD COLUMN "buttonBorderRadius" INTEGER;
ALTER TABLE "CartUpsellSettings" ADD COLUMN "buttonColor" TEXT;
ALTER TABLE "CartUpsellSettings" ADD COLUMN "buttonTextColor" TEXT;
ALTER TABLE "CartUpsellSettings" ADD COLUMN "headingText" TEXT;

-- CreateTable
CREATE TABLE "UpsellEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "amount" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "UpsellEvent_shop_type_idx" ON "UpsellEvent"("shop", "type");

-- CreateIndex
CREATE INDEX "UpsellEvent_shop_productId_idx" ON "UpsellEvent"("shop", "productId");
