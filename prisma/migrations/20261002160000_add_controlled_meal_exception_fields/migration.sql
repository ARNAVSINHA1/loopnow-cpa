ALTER TABLE "Receipt" ADD COLUMN "mealExceptionProposal" TEXT;
ALTER TABLE "Expense" ADD COLUMN "mealException" TEXT;
ALTER TABLE "Approval" ADD COLUMN "proposedMealException" TEXT;