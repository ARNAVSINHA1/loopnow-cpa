import prisma from "@/server/db/prisma";
import type { DatabaseClient } from "@/server/db/types";
import {
  RequestHumanReviewInputSchema,
  RequestHumanReviewResultSchema,
  UpdateExpenseClassificationInputSchema,
  UpdateExpenseClassificationResultSchema,
  GetProcessingStatusInputSchema,
  ProcessingStatusResultSchema,
  type RequestHumanReviewInput,
  type UpdateExpenseClassificationInput,
  type GetProcessingStatusInput,
} from "./contracts";

export async function updateExpenseClassification(
  input: UpdateExpenseClassificationInput,
  db: DatabaseClient = prisma,
) {
  const parsed = UpdateExpenseClassificationInputSchema.parse(input);

  const receipt = await db.receipt.findUnique({
    where: {
      id: parsed.receiptId,
    },
  });

  if (!receipt) {
    return UpdateExpenseClassificationResultSchema.parse({
      status: "FAILURE",
      receiptId: parsed.receiptId,
      category: null,
      gifiCode: null,
      confidence: null,
      reason: "Receipt not found.",
    });
  }

  const expense = await db.expense.upsert({
    where: {
      receiptId: parsed.receiptId,
    },
    create: {
      receiptId: parsed.receiptId,
      category: parsed.category,
      gifiCode: parsed.gifiCode,
      commercialUsePercentage: parsed.commercialUsePercentage,
      grossTax: parsed.grossTax,
      eligibilityPercentage: parsed.eligibilityPercentage,
      eligibleItc: parsed.eligibleItc,
      itcStatus: parsed.itcStatus,
      classificationStatus: parsed.classificationStatus,
      confidence: parsed.confidence,
      reason: parsed.reason,
    },
    update: {
      category: parsed.category,
      gifiCode: parsed.gifiCode,
      commercialUsePercentage: parsed.commercialUsePercentage,
      grossTax: parsed.grossTax,
      eligibilityPercentage: parsed.eligibilityPercentage,
      eligibleItc: parsed.eligibleItc,
      itcStatus: parsed.itcStatus,
      classificationStatus: parsed.classificationStatus,
      confidence: parsed.confidence,
      reason: parsed.reason,
    },
  });

  return UpdateExpenseClassificationResultSchema.parse({
    status:
      parsed.classificationStatus === "REVIEW_REQUIRED"
        ? "REVIEW_REQUIRED"
        : "SUCCESS",
    receiptId: parsed.receiptId,
    category: expense.category,
    gifiCode: expense.gifiCode,
    confidence: expense.confidence === null ? null : Number(expense.confidence),
    reason: expense.reason ?? parsed.reason,
  });
}

export async function requestHumanReview(
  input: RequestHumanReviewInput,
  db: DatabaseClient = prisma,
) {
  const parsed = RequestHumanReviewInputSchema.parse(input);

  const receipt = await db.receipt.findUnique({
    where: {
      id: parsed.receiptId,
    },
  });

  if (!receipt) {
    return RequestHumanReviewResultSchema.parse({
      status: "FAILURE",
      receiptId: parsed.receiptId,
      approvalId: null,
      message: "Receipt not found.",
    });
  }

  const existingApproval = await db.approval.findFirst({
    where: {
      receiptId: parsed.receiptId,
      status: "PENDING",
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const approval =
    existingApproval ??
    (await db.approval.create({
      data: {
        receiptId: parsed.receiptId,
        agentRunId: parsed.agentRunId,
        status: "PENDING",
        proposedCategory: parsed.proposedCategory,
        proposedGifiCode: parsed.proposedGifiCode,
        proposedItc: parsed.proposedItc,
        reason: parsed.reason,
      },
    }));

  await db.receipt.update({
    where: {
      id: parsed.receiptId,
    },
    data: {
      status: "REVIEW_REQUIRED",
    },
  });

  return RequestHumanReviewResultSchema.parse({
    status: "SUCCESS",
    receiptId: parsed.receiptId,
    approvalId: approval.id,
    message: existingApproval
      ? "Receipt is already awaiting human review."
      : "Human review requested successfully.",
  });
}

export async function getProcessingStatus(
  input: GetProcessingStatusInput,
  db: DatabaseClient = prisma,
) {
  const parsed = GetProcessingStatusInputSchema.parse(input);

  const receipt = await db.receipt.findUnique({
    where: {
      id: parsed.receiptId,
    },
    include: {
      agentRuns: {
        orderBy: {
          startedAt: "desc",
        },
        take: 1,
        include: {
          toolCalls: {
            orderBy: {
              startedAt: "desc",
            },
            take: 1,
          },
        },
      },
      approvals: {
        where: {
          status: "PENDING",
        },
        take: 1,
      },
    },
  });

  if (!receipt) {
    return ProcessingStatusResultSchema.parse({
      status: "FAILURE",
      receiptId: parsed.receiptId,
      receiptStatus: null,
      agentRunStatus: null,
      latestTool: null,
      latestToolStatus: null,
      pendingApproval: false,
      message: "Receipt not found.",
    });
  }

  const latestRun = receipt.agentRuns[0];
  const latestTool = latestRun?.toolCalls[0];

  return ProcessingStatusResultSchema.parse({
    status: "SUCCESS",
    receiptId: receipt.id,
    receiptStatus: receipt.status,
    agentRunStatus: latestRun?.status ?? null,
    latestTool: latestTool?.toolName ?? null,
    latestToolStatus: latestTool?.status ?? null,
    pendingApproval: receipt.approvals.length > 0,
    message: receipt.approvals.length
      ? "Receipt is awaiting human review."
      : `Receipt status is ${receipt.status}.`,
  });
}
