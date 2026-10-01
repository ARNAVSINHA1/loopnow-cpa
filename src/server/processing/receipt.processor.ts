import { prisma } from "@/server/db";
import { runReceiptAgent } from "@/server/agent/receipt-agent";
import {
  createAgentRun,
  completeAgentRun,
  failAgentRun,
} from "@/server/agent/agent-run";

const RULE_VERSION = "CRA-PROTOTYPE-v1";
const MODEL = "cpa-copilot-v1";

export async function processReceipt(receiptId: string) {
  return prisma.$transaction(async (tx) => {
    const receipt = await tx.receipt.findUnique({
      where: { id: receiptId },
    });

    if (!receipt) {
      throw new Error("Receipt not found");
    }

    if (receipt.status === "REVIEW_REQUIRED") {
      const existingApproval = await tx.approval.findFirst({
        where: {
          receiptId: receipt.id,
          status: "PENDING",
        },
        orderBy: { createdAt: "desc" },
      });

      if (existingApproval) {
        return {
          receiptId: receipt.id,
          status: "REVIEW_REQUIRED" as const,
          approvalId: existingApproval.id,
          message: "Receipt is already awaiting human review.",
        };
      }
    }

    if (receipt.status === "COMPLETED") {
      return {
        receiptId: receipt.id,
        status: "COMPLETED" as const,
        message: "Receipt has already been processed and approved.",
      };
    }

    const agentRun = await createAgentRun(
      {
        receiptId: receipt.id,
        requestId: crypto.randomUUID(),
        provider: "internal",
        model: "cpa-copilot-v1",
      },
      tx,
    );

    const RULE_VERSION = "CRA-PROTOTYPE-v1";
    const MODEL = "cpa-copilot-v1";

    try {
      await tx.auditEvent.create({
        data: {
          actor: "system",
          receiptId: receipt.id,
          agentRunId: agentRun.id,
          action: "PROCESSING_STARTED",
          ruleVersion: RULE_VERSION,
          model: MODEL,
          status: "SUCCESS",
        },
      });

      const result = await runReceiptAgent({
        receiptId: receipt.id,
        agentRunId: agentRun.id,
        db: tx,
      });

      if (result.status === "COMPLETED") {
        await tx.receipt.update({
          where: { id: receipt.id },
          data: {
            status: "COMPLETED",
          },
        });
      }

      await tx.auditEvent.create({
        data: {
          actor: "system",
          receiptId: receipt.id,
          agentRunId: agentRun.id,
          action: "PROCESSING_COMPLETED",
          ruleVersion: RULE_VERSION,
          model: MODEL,
          status:
            result.status === "REVIEW_REQUIRED" ? "REVIEW_REQUIRED" : "SUCCESS",
          metadata: {
            gstHstValidationStatus: result.gstHstValidationStatus,
            classification: result.classification,
            gifiCode: result.gifiCode,
            documentationStatus: result.documentationStatus,
            itcStatus: result.itcStatus,
            eligibleItc: result.eligibleItc,
            verificationPassed: result.verificationPassed,
            requiresReview: result.requiresReview,
          },
        },
      });

      await completeAgentRun(agentRun.id, tx);

      return {
        receiptId: result.receiptId,
        agentRunId: agentRun.id,
        status: result.status,
        classification: result.classification,
        gifiCode: result.gifiCode,
        documentationStatus: result.documentationStatus,
        itcStatus: result.itcStatus,
        eligibleItc: result.eligibleItc,
        requiresReview: result.requiresReview,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown processing error.";

      await failAgentRun(agentRun.id, message, tx);

      await tx.auditEvent.create({
        data: {
          actor: "system",
          receiptId: receipt.id,
          agentRunId: agentRun.id,
          action: "PROCESSING_FAILED",
          ruleVersion: RULE_VERSION,
          model: MODEL,
          status: "FAILURE",
          metadata: {
            error: message,
          },
        },
      });

      throw error;
    }
  });
}
