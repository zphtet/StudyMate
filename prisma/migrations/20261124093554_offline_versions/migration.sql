-- AlterTable
ALTER TABLE "submissions" ADD COLUMN     "client_op_id" UUID;

-- AlterTable
ALTER TABLE "shifts" ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE UNIQUE INDEX "submissions_client_op_id_key" ON "submissions"("client_op_id");

