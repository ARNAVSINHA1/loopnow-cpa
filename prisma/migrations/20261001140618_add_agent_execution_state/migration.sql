-- AlterTable
ALTER TABLE "AgentRun" ADD COLUMN     "currentStep" TEXT,
ADD COLUMN     "currentTool" TEXT,
ADD COLUMN     "iteration" INTEGER NOT NULL DEFAULT 0;
