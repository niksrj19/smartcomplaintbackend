-- AlterTable
ALTER TABLE "complaints" ADD COLUMN     "escalated_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "complaints_sla_due_at_escalated_at_idx" ON "complaints"("sla_due_at", "escalated_at");
