-- CreateTable
CREATE TABLE "CartUpsellSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'ltr',
    "sourceType" TEXT NOT NULL DEFAULT 'collection',
    "collectionId" TEXT,
    "productIds" TEXT NOT NULL DEFAULT '[]',
    "displayMode" TEXT NOT NULL DEFAULT 'list',
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "CartUpsellSettings_shop_key" ON "CartUpsellSettings"("shop");
