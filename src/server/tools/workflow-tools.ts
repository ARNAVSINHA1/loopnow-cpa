/*
 * Loopnow CPA
 * Receipt Processing & GST/HST Bookkeeping
 *
 * Copyright (c) 2026 Arnava Kumar Sinha. All rights reserved.
 */

import prisma from "@/server/db/prisma";
import type { DatabaseClient } from "@/server/db/types";
import {
  calculateDeterministicEligibilityPercentage,
  calculateDeterministicItcLimit,
  normalizeExpenseCategory,
  validateControlledGifi,
} from "@/server/approvals/review-validation";
import { evaluateDocumentation } from "@/server/domain/cra/documentation-rules";
import { isMealITCException } from "@/server/domain/cra/meals-rules";
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

  const normalizedCategory = normalizeExpenseCategory(parsed.category);

  if (!normalizedCategory) {
    return UpdateExpenseClassificationResultSchema.parse({
      status: "FAILURE",
      receiptId: parsed.receiptId,
      category: null,
      gifiCode: null,
      confidence: null,
      reason: "Expense category is invalid or not recognized.",
    });
  }

  let controlledGifi: string | null;

  try {
    controlledGifi = validateControlledGifi(
      normalizedCategory,
      parsed.gifiCode,
    );

    if (parsed.classificationStatus === "CLASSIFIED" && !controlledGifi) {
      throw new Error("A controlled GIFI code is required for classification.");
    }
  } catch {
    return UpdateExpenseClassificationResultSchema.parse({
      status: "FAILURE",
      receiptId: parsed.receiptId,
      category: null,
      gifiCode: null,
      confidence: null,
      reason:
        "GIFI mapping failed validation against the controlled catalogue.",
    });
  }

  const commercialUsePercentage =
    receipt.commercialUsePercentage === null
      ? 100
      : Number(receipt.commercialUsePercentage);
  const taxAmount = Number(receipt.taxAmount);
  const mealException = parsed.mealException ?? "standard";

  if (
    !Number.isFinite(commercialUsePercentage) ||
    commercialUsePercentage < 0 ||
    commercialUsePercentage > 100 ||
    !Number.isFinite(taxAmount) ||
    taxAmount < 0
  ) {
    return UpdateExpenseClassificationResultSchema.parse({
      status: "FAILURE",
      receiptId: parsed.receiptId,
      category: null,
      gifiCode: null,
      confidence: null,
      reason: "Persisted financial inputs are invalid.",
    });
  }

  if (
    normalizedCategory === "Meals and Entertainment" &&
    !isMealITCException(mealException)
  ) {
    return UpdateExpenseClassificationResultSchema.parse({
      status: "REVIEW_REQUIRED",
      receiptId: parsed.receiptId,
      category: normalizedCategory,
      gifiCode: controlledGifi,
      confidence: parsed.confidence,
      reason: "Meal exception is unsupported and requires human review.",
    });
  }

  if (
    normalizedCategory === "Meals and Entertainment" &&
    mealException !== "standard" &&
    parsed.classificationStatus !== "REVIEW_REQUIRED"
  ) {
    return UpdateExpenseClassificationResultSchema.parse({
      status: "FAILURE",
      receiptId: parsed.receiptId,
      category: null,
      gifiCode: null,
      confidence: null,
      reason:
        "Nonstandard meal exceptions require an authorized review decision.",
    });
  }

  const documentation = evaluateDocumentation({
    total: Number(receipt.total),
    gstHstNumber: receipt.gstHstNumber,
  });
  const acceptedMealException = isMealITCException(mealException)
    ? mealException
    : "standard";
  const expectedItc =
    parsed.classificationStatus === "REVIEW_REQUIRED" ||
    documentation.status !== "sufficient"
      ? 0
      : calculateDeterministicItcLimit(
          taxAmount,
          commercialUsePercentage,
          normalizedCategory,
          acceptedMealException,
        );

  if (parsed.eligibleItc > expectedItc + 0.01) {
    return UpdateExpenseClassificationResultSchema.parse({
      status: "FAILURE",
      receiptId: parsed.receiptId,
      category: null,
      gifiCode: null,
      confidence: null,
      reason: "Client-supplied ITC exceeds the server-calculated maximum.",
    });
  }

  if (
    parsed.classificationStatus === "CLASSIFIED" &&
    Math.abs(parsed.eligibleItc - expectedItc) > 0.01
  ) {
    return UpdateExpenseClassificationResultSchema.parse({
      status: "FAILURE",
      receiptId: parsed.receiptId,
      category: null,
      gifiCode: null,
      confidence: null,
      reason:
        "Eligible ITC does not match the deterministic server calculation.",
    });
  }

  const expectedEligibilityPercentage =
    parsed.classificationStatus === "CLASSIFIED" &&
    documentation.status === "sufficient"
      ? calculateDeterministicEligibilityPercentage(
          commercialUsePercentage,
          normalizedCategory,
          acceptedMealException,
        )
      : 0;
  const expectedItcStatus =
    parsed.classificationStatus === "REVIEW_REQUIRED"
      ? "REVIEW"
      : expectedItc === 0
        ? "INELIGIBLE"
        : expectedItc >= taxAmount
          ? "ELIGIBLE"
          : "PARTIAL";

  const expense = await db.expense.upsert({
    where: {
      receiptId: parsed.receiptId,
    },
    create: {
      receiptId: parsed.receiptId,
      category: normalizedCategory,
      gifiCode: controlledGifi,
      mealException:
        parsed.classificationStatus === "CLASSIFIED" &&
        normalizedCategory === "Meals and Entertainment"
          ? mealException
          : null,
      commercialUsePercentage,
      grossTax: taxAmount,
      eligibilityPercentage: expectedEligibilityPercentage,
      eligibleItc: expectedItc,
      itcStatus: expectedItcStatus,
      classificationStatus: parsed.classificationStatus,
      confidence: parsed.confidence,
      reason: parsed.reason,
    },
    update: {
      category: normalizedCategory,
      gifiCode: parsed.gifiCode,
      mealException:
        parsed.classificationStatus === "CLASSIFIED" &&
        normalizedCategory === "Meals and Entertainment"
          ? mealException
          : null,
      commercialUsePercentage,
      grossTax: taxAmount,
      eligibilityPercentage: expectedEligibilityPercentage,
      eligibleItc: expectedItc,
      itcStatus: expectedItcStatus,
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

  const normalizedCategory = normalizeExpenseCategory(
    parsed.proposedCategory ?? "Unknown",
  );

  if (!normalizedCategory) {
    return RequestHumanReviewResultSchema.parse({
      status: "FAILURE",
      receiptId: parsed.receiptId,
      approvalId: null,
      message: "Proposed category is invalid or not recognized.",
    });
  }

  try {
    validateControlledGifi(normalizedCategory, parsed.proposedGifiCode ?? null);
  } catch {
    return RequestHumanReviewResultSchema.parse({
      status: "FAILURE",
      receiptId: parsed.receiptId,
      approvalId: null,
      message: "Proposed GIFI mapping is invalid.",
    });
  }

  const expectedItc = calculateDeterministicItcLimit(
    Number(receipt.taxAmount ?? 0),
    Number(receipt.commercialUsePercentage ?? 100),
    normalizedCategory,
  );

  if (parsed.proposedItc > expectedItc + 0.01) {
    return RequestHumanReviewResultSchema.parse({
      status: "FAILURE",
      receiptId: parsed.receiptId,
      approvalId: null,
      message: "Proposed ITC exceeds the server-calculated maximum.",
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
        proposedMealException: parsed.proposedMealException ?? null,
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
  });

  if (!receipt) {
    return ProcessingStatusResultSchema.parse({
      status: "FAILURE",
      receiptId: parsed.receiptId,
      receiptStatus: null,
      agentRunStatus: null,
      currentStep: null,
      currentTool: null,
      iteration: null,
      latestTool: null,
      latestToolStatus: null,
      pendingApproval: false,
      message: "Receipt not found.",
    });
  }

  const agentRun = await db.agentRun.findFirst({
    where: {
      receiptId: parsed.receiptId,
    },
    orderBy: {
      startedAt: "desc",
    },
  });

  const toolCalls = agentRun
    ? await db.toolCall.findMany({
        where: {
          agentRunId: agentRun.id,
        },
        orderBy: [{ completedAt: "desc" }, { startedAt: "desc" }],
      })
    : [];

  const latestToolCall =
    toolCalls.sort((left, right) => {
      const leftTime = left.completedAt ?? left.startedAt;
      const rightTime = right.completedAt ?? right.startedAt;

      return new Date(rightTime).getTime() - new Date(leftTime).getTime();
    })[0] ?? null;

  const pendingApproval = await db.approval.findFirst({
    where: {
      receiptId: parsed.receiptId,
      status: "PENDING",
    },
  });

  return ProcessingStatusResultSchema.parse({
    status: "SUCCESS",
    receiptId: parsed.receiptId,
    receiptStatus: receipt.status,
    agentRunStatus: agentRun?.status ?? null,
    currentStep: agentRun?.currentStep ?? null,
    currentTool: agentRun?.currentTool ?? null,
    iteration: agentRun?.iteration ?? null,
    latestTool: latestToolCall?.toolName ?? null,
    latestToolStatus: latestToolCall?.status ?? null,
    pendingApproval: Boolean(pendingApproval),
    message:
      receipt.status === "REVIEW_REQUIRED"
        ? "Receipt is awaiting human review."
        : receipt.status === "COMPLETED"
          ? "Receipt processing is complete."
          : receipt.status === "PENDING"
            ? "Receipt processing has not started."
            : receipt.status === "ERROR"
              ? "Receipt processing failed."
          : "Receipt processing is in progress.",
  });
}
