-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "practiceSubjectId" TEXT;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_practiceSubjectId_fkey" FOREIGN KEY ("practiceSubjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
