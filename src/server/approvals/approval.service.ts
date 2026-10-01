import { prisma } from "@/server/db";

export type ApprovalAction =
  | "APPROVE"
  | "REJECT"
  | "EDIT";

export type ApprovalDecisionInput = {
  approvalId: string;
  action: ApprovalAction;
  reviewer: string;
  category?: string;
  gifiCode?: string;
  itc?: number;
  decision?: string;
};

export async function processApproval(
  input: ApprovalDecisionInput,
) {
  return prisma.$transaction(async (tx) => {
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

    const now = new Date();

    let status:
      | "APPROVED"
      | "REJECTED"
      | "EDITED";

    if (input.action === "APPROVE") {
      status = "APPROVED";
    } else if (input.action === "REJECT") {
      status = "REJECTED";
    } else {
      status = "EDITED";
    }

    const finalCategory =
      input.category ??
      approval.proposedCategory;

    const finalGifiCode =
      input.gifiCode ??
      approval.proposedGifiCode;

    const finalItc =
      input.itc ??
      (approval.proposedItc !== null
        ? Number(approval.proposedItc)
        : 0);

    const updatedApproval =
      await tx.approval.update({
        where: {
          id: approval.id,
        },
        data: {
          status,
          reviewer: input.reviewer,
          decision:
            input.decision ??
            input.action,
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
    if (
      status === "APPROVED" ||
      status === "EDITED"
    ) {
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
          decision:
            input.decision ??
            input.action,
        },
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
}