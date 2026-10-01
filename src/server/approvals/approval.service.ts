/*
 * Loopnow CPA
 * Receipt Processing & GST/HST Bookkeeping
 *
 * Copyright (c) 2026 Arnava Kumar Sinha. All rights reserved.
 */

import { prisma } from "@/server/db";
import {
  calculateDeterministicItcLimit,
  normalizeExpenseCategory,
  validateControlledGifi,
} from "@/server/approvals/review-validation";
import { evaluateDocumentation } from "@/server/domain/cra/documentation-rules";
import { isMealITCException } from "@/server/domain/cra/meals-rules";

export type ApprovalAction = "APPROVE" | "REJECT" | "EDIT";

export type ApprovalDecisionInput = {
  approvalId: string;
  action: ApprovalAction;
  reviewer: string;
  category?: string;
  gifiCode?: string;
  itc?: number;
  mealException?: string;
  decision?: string;
};

export async function recordApprovalFailure(input: {
  approvalId: string;
  actor: string;
  action: string;
  reason: string;
}) {
  const approval = await prisma.approval.findUnique({
    where: { id: input.approvalId },
    select: { receiptId: true, agentRunId: true },
  });

  await prisma.auditEvent.create({
    data: {
      actor: input.actor,
      receiptId: approval?.receiptId ?? null,
      agentRunId: approval?.agentRunId ?? null,
      action: "APPROVAL_MUTATION_FAILED",
      status: "FAILURE",
      ruleVersion: "CRA-PROTOTYPE-v1",
      metadata: {
        approvalId: input.approvalId,
        attemptedAction: input.action,
        reason: input.reason,
      },
    },
  });
}

export async function processApproval(input: ApprovalDecisionInput) {
  try {
    return await prisma.$transaction(async (tx) => {
      const approval = await tx.approval.findUnique({
        where: {
          id: input.approvalId,
        },
        include: {
          receipt: true,
        },
      });

      if (!approval) {
        throw new Error("Approval not found");
      }

      if (approval.status !== "PENDING") {
        throw new Error("Approval has already been decided");
      }

      const receipt = approval.receipt;
      const receiptExpense = await tx.expense.findUnique({
        where: {
          receiptId: receipt.id,
        },
      });

      if (receipt.status === "COMPLETED") {
        throw new Error("Receipt has already been resolved.");
      }

      if (receipt.status !== "REVIEW_REQUIRED") {
        throw new Error("Receipt is not awaiting human review.");
      }

      let finalCategory: string | null = null;
      let finalGifiCode: string | null = null;
      let finalMealException: string | null = null;
      let finalItc = 0;

      if (input.action !== "REJECT") {
        const categoryForDecision =
          input.action === "EDIT"
            ? input.category
            : (approval.proposedCategory ?? receipt.category ?? undefined);
        const normalizedCategory =
          normalizeExpenseCategory(categoryForDecision);

        if (!normalizedCategory || normalizedCategory === "Unknown") {
          throw new Error("Expense category is invalid or not recognized.");
        }

        finalCategory = normalizedCategory;
        finalGifiCode = validateControlledGifi(
          normalizedCategory,
          input.action === "EDIT" ? input.gifiCode : approval.proposedGifiCode,
        );

        if (!finalGifiCode) {
          throw new Error("A controlled GIFI code is required.");
        }

        if (normalizedCategory === "Meals and Entertainment") {
          const requestedException =
            input.mealException ??
            (approval.proposedMealException == null ||
            approval.proposedMealException === "standard"
              ? "standard"
              : undefined);

          if (!isMealITCException(requestedException)) {
            throw new Error(
              "A supported meal exception must be confirmed by the reviewer.",
            );
          }

          finalMealException = requestedException;
        } else if (input.mealException !== undefined) {
          throw new Error(
            "Meal exceptions apply only to meal classifications.",
          );
        }

        const rawCommercialUse =
          receiptExpense?.commercialUsePercentage ??
          receipt.commercialUsePercentage;
        const commercialUse =
          rawCommercialUse === null || rawCommercialUse === undefined
            ? 100
            : Number(rawCommercialUse);

        if (
          !Number.isFinite(commercialUse) ||
          commercialUse < 0 ||
          commercialUse > 100
        ) {
          throw new Error("Stored commercial-use percentage is invalid.");
        }

        const taxAmount = Number(receipt.taxAmount);

        if (!Number.isFinite(taxAmount) || taxAmount < 0) {
          throw new Error("Stored tax amount is invalid.");
        }

        const documentation = evaluateDocumentation({
          total: Number(receipt.total),
          gstHstNumber: receipt.gstHstNumber,
        });
        const serverCalculatedItc =
          documentation.status === "sufficient"
            ? calculateDeterministicItcLimit(
                taxAmount,
                commercialUse,
                normalizedCategory,
                finalMealException,
              )
            : 0;

        if (input.itc !== undefined) {
          if (!Number.isFinite(input.itc) || input.itc < 0) {
            throw new Error("Client ITC assertion is invalid.");
          }

          if (input.itc > serverCalculatedItc + 0.01) {
            throw new Error(
              "ITC exceeds the server-calculated maximum for this receipt.",
            );
          }
        }

        finalItc = serverCalculatedItc;
      }

      const now = new Date();

      let status: "APPROVED" | "REJECTED" | "EDITED";

      if (input.action === "APPROVE") {
        status = "APPROVED";
      } else if (input.action === "REJECT") {
        status = "REJECTED";
      } else {
        status = "EDITED";
      }

      const updatedApproval = await tx.approval.update({
        where: {
          id: approval.id,
        },
        data: {
          status,
          reviewer: input.reviewer,
          decision: input.decision ?? input.action,
          reviewedAt: now,
        },
      });

      /*
       * REJECT:
       * The proposed classification is not accepted.
       */
      if (status === "REJECTED") {
        await tx.receipt.update({
          where: {
            id: approval.receiptId,
          },
          data: {
            status: "REVIEW_REQUIRED",
          },
        });

        await tx.expense.update({
          where: {
            receiptId: approval.receiptId,
          },
          data: {
            classificationStatus: "REJECTED",
          },
        });
      }

      /*
       * APPROVE / EDIT:
       * Persist the reviewer's accepted values.
       */
      if (status === "APPROVED" || status === "EDITED") {
        const finalItcStatus =
          finalItc <= 0
            ? "INELIGIBLE"
            : finalItc >= Number(approval.receipt.taxAmount)
              ? "ELIGIBLE"
              : "PARTIAL";

        await tx.expense.update({
          where: { receiptId: approval.receiptId },
          data: {
            category: finalCategory,
            gifiCode: finalGifiCode,
            mealException: finalMealException,
            eligibleItc: finalItc,
            itcStatus: finalItcStatus,
            classificationStatus: "CLASSIFIED",
            reason:
              status === "EDITED"
                ? "Classification edited and approved by reviewer."
                : "Classification approved by reviewer.",
          },
        });

        await tx.receipt.update({
          where: {
            id: approval.receiptId,
          },
          data: {
            status: "COMPLETED",
          },
        });
      }

      await tx.auditEvent.create({
        data: {
          actor: input.reviewer,
          receiptId: approval.receiptId,
          agentRunId: approval.agentRunId,
          action: `APPROVAL_${status}`,
          status: "SUCCESS",
          metadata: {
            approvalId: approval.id,
            reviewer: input.reviewer,
            action: input.action,
            category: finalCategory,
            gifiCode: finalGifiCode,
            eligibleItc: finalItc,
            mealException: finalMealException,
            decision: input.decision ?? input.action,
            ruleVersion: "CRA-PROTOTYPE-v1",
          },
          ruleVersion: "CRA-PROTOTYPE-v1",
        },
      });

      return {
        approvalId: updatedApproval.id,
        receiptId: approval.receiptId,
        status,
        reviewer: input.reviewer,
        category: finalCategory,
        gifiCode: finalGifiCode,
        eligibleItc: finalItc,
      };
    });
  } catch (error) {
    await recordApprovalFailure({
      approvalId: input.approvalId,
      actor: input.reviewer,
      action: input.action,
      reason:
        error instanceof Error ? error.message : "Review mutation failed.",
    }).catch(() => undefined);

    throw error;
  }
}
