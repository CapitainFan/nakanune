-- CreateEnum
CREATE TYPE "ClassKind" AS ENUM ('LECTURE', 'PRACTICE', 'LAB', 'SEMINAR');

-- AlterEnum
ALTER TYPE "SourceType" ADD VALUE 'MMF_SCHEDULE';

-- AlterTable
ALTER TABLE "ClassSession" ADD COLUMN     "kind" "ClassKind",
ADD COLUMN     "note" TEXT,
ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "subgroup" TEXT,
ADD COLUMN     "teacher" TEXT,
ADD COLUMN     "validFrom" DATE;

-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "subgroup" TEXT;

-- AddForeignKey
ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;
