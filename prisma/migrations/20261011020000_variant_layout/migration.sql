ALTER TABLE "CartUpsellSettings"
  ADD COLUMN "selectButtonLabel" TEXT,
  ADD COLUMN "variantLayout" TEXT NOT NULL DEFAULT 'select';
