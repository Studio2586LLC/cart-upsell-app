ALTER TABLE "CartUpsellSettings"
  ADD COLUMN "swatchShape" TEXT NOT NULL DEFAULT 'circle',
  ADD COLUMN "swatchSize" INTEGER NOT NULL DEFAULT 28,
  ADD COLUMN "otherOptionStyle" TEXT NOT NULL DEFAULT 'boxes';
