-- CreateEnum
CREATE TYPE "CardStatus" AS ENUM ('PENDING', 'ACTIVE', 'FROZEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "CardIssuer" AS ENUM ('UNION33', 'ONAFRIQ', 'OTHER');

-- AlterEnum
ALTER TYPE "ProviderName" ADD VALUE 'CARD_ISSUER';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TransactionType" ADD VALUE 'CARD_LOAD';
ALTER TYPE "TransactionType" ADD VALUE 'CARD_UNLOAD';

-- CreateTable
CREATE TABLE "virtual_cards" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "ownerMerchantId" TEXT,
    "issuer" "CardIssuer" NOT NULL,
    "providerRef" TEXT,
    "maskedPan" TEXT,
    "expiryMonth" INTEGER,
    "expiryYear" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "balance" BIGINT NOT NULL DEFAULT 0,
    "status" "CardStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "virtual_cards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "virtual_cards_ownerUserId_idx" ON "virtual_cards"("ownerUserId");

-- CreateIndex
CREATE INDEX "virtual_cards_ownerMerchantId_idx" ON "virtual_cards"("ownerMerchantId");

-- CreateIndex
CREATE INDEX "virtual_cards_status_idx" ON "virtual_cards"("status");

-- AddForeignKey
ALTER TABLE "virtual_cards" ADD CONSTRAINT "virtual_cards_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "virtual_cards" ADD CONSTRAINT "virtual_cards_ownerMerchantId_fkey" FOREIGN KEY ("ownerMerchantId") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
