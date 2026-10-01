-- CreateEnum
CREATE TYPE "ReceiptStatus" AS ENUM ('PENDING', 'PROCESSING', 'REVIEW_REQUIRED', 'COMPLETED', 'ERROR');

-- CreateEnum
CREATE TYPE "ExpenseClassificationStatus" AS ENUM ('PENDING', 'CLASSIFIED', 'REVIEW_REQUIRED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ITCStatus" AS ENUM ('ELIGIBLE', 'PARTIAL', 'INELIGIBLE', 'REVIEW');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EDITED');

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ToolCallStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "AuditStatus" AS ENUM ('SUCCESS', 'FAILURE', 'REVIEW_REQUIRED');

-- CreateEnum
CREATE TYPE "ComplianceAuthority" AS ENUM ('CRA');

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "receiptDate" TIMESTAMP(3),
    "description" TEXT,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "taxAmount" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "taxType" TEXT,
    "gstHstNumber" TEXT,
    "commercialUsePercentage" DECIMAL(5,2),
    "category" TEXT,
    "receiptAvailable" BOOLEAN NOT NULL DEFAULT true,
    "status" "ReceiptStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "category" TEXT,
    "gifiCode" TEXT,
    "commercialUsePercentage" DECIMAL(5,2),
    "grossTax" DECIMAL(12,2),
    "eligibilityPercentage" DECIMAL(5,2),
    "eligibleItc" DECIMAL(12,2),
    "itcStatus" "ITCStatus",
    "classificationStatus" "ExpenseClassificationStatus" NOT NULL DEFAULT 'PENDING',
    "confidence" DECIMAL(5,4),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GifiCode" (
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "parentCategory" TEXT,
    "applicableExpenseTypes" JSONB,
    "confidence" DECIMAL(5,4),
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GifiCode_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "ComplianceRule" (
    "id" TEXT NOT NULL,
    "ruleKey" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "configuration" JSONB,
    "sourceId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceSource" (
    "id" TEXT NOT NULL,
    "authority" "ComplianceAuthority" NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "retrievedAt" TIMESTAMP(3),
    "ruleVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT,
    "requestId" TEXT,
    "model" TEXT,
    "provider" TEXT,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolCall" (
    "id" TEXT NOT NULL,
    "agentRunId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "status" "ToolCallStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "latencyMs" INTEGER,
    "error" TEXT,

    CONSTRAINT "ToolCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" TEXT NOT NULL,
    "receiptId" TEXT,
    "agentRunId" TEXT,
    "action" TEXT NOT NULL,
    "inputHash" TEXT,
    "resultHash" TEXT,
    "ruleVersion" TEXT,
    "model" TEXT,
    "status" "AuditStatus" NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "agentRunId" TEXT,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "proposedCategory" TEXT,
    "proposedGifiCode" TEXT,
    "proposedItc" DECIMAL(12,2),
    "reason" TEXT,
    "reviewer" TEXT,
    "decision" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Receipt_receiptDate_idx" ON "Receipt"("receiptDate");

-- CreateIndex
CREATE INDEX "Receipt_status_idx" ON "Receipt"("status");

-- CreateIndex
CREATE INDEX "Receipt_vendor_idx" ON "Receipt"("vendor");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_receiptId_key" ON "Expense"("receiptId");

-- CreateIndex
CREATE INDEX "Expense_gifiCode_idx" ON "Expense"("gifiCode");

-- CreateIndex
CREATE INDEX "Expense_classificationStatus_idx" ON "Expense"("classificationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceRule_ruleKey_key" ON "ComplianceRule"("ruleKey");

-- CreateIndex
CREATE INDEX "ComplianceRule_version_idx" ON "ComplianceRule"("version");

-- CreateIndex
CREATE INDEX "ComplianceRule_active_idx" ON "ComplianceRule"("active");

-- CreateIndex
CREATE INDEX "ComplianceSource_authority_idx" ON "ComplianceSource"("authority");

-- CreateIndex
CREATE INDEX "ComplianceSource_ruleVersion_idx" ON "ComplianceSource"("ruleVersion");

-- CreateIndex
CREATE INDEX "AgentRun_receiptId_idx" ON "AgentRun"("receiptId");

-- CreateIndex
CREATE INDEX "AgentRun_requestId_idx" ON "AgentRun"("requestId");

-- CreateIndex
CREATE INDEX "AgentRun_status_idx" ON "AgentRun"("status");

-- CreateIndex
CREATE INDEX "AgentRun_startedAt_idx" ON "AgentRun"("startedAt");

-- CreateIndex
CREATE INDEX "ToolCall_agentRunId_idx" ON "ToolCall"("agentRunId");

-- CreateIndex
CREATE INDEX "ToolCall_toolName_idx" ON "ToolCall"("toolName");

-- CreateIndex
CREATE INDEX "ToolCall_status_idx" ON "ToolCall"("status");

-- CreateIndex
CREATE INDEX "AuditEvent_receiptId_idx" ON "AuditEvent"("receiptId");

-- CreateIndex
CREATE INDEX "AuditEvent_agentRunId_idx" ON "AuditEvent"("agentRunId");

-- CreateIndex
CREATE INDEX "AuditEvent_timestamp_idx" ON "AuditEvent"("timestamp");

-- CreateIndex
CREATE INDEX "AuditEvent_action_idx" ON "AuditEvent"("action");

-- CreateIndex
CREATE INDEX "Approval_receiptId_idx" ON "Approval"("receiptId");

-- CreateIndex
CREATE INDEX "Approval_agentRunId_idx" ON "Approval"("agentRunId");

-- CreateIndex
CREATE INDEX "Approval_status_idx" ON "Approval"("status");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceRule" ADD CONSTRAINT "ComplianceRule_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ComplianceSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolCall" ADD CONSTRAINT "ToolCall_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
