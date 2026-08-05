-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartUpsellSettings" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'ltr',
    "sourceType" TEXT NOT NULL DEFAULT 'collection',
    "collectionId" TEXT,
    "productIds" TEXT NOT NULL DEFAULT '[]',
    "displayMode" TEXT NOT NULL DEFAULT 'list',
    "headingText" TEXT,
    "buttonColor" TEXT,
    "buttonTextColor" TEXT,
    "buttonBorderRadius" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CartUpsellSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UpsellEvent" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "amount" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UpsellEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Session_shop_idx" ON "Session"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "CartUpsellSettings_shop_key" ON "CartUpsellSettings"("shop");

-- CreateIndex
CREATE INDEX "UpsellEvent_shop_type_createdAt_idx" ON "UpsellEvent"("shop", "type", "createdAt");

-- CreateIndex
CREATE INDEX "UpsellEvent_shop_productId_idx" ON "UpsellEvent"("shop", "productId");
