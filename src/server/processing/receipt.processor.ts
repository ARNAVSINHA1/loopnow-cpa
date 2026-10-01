/*
 * Loopnow CPA
 * Receipt Processing & GST/HST Bookkeeping
 *
 * Copyright (c) 2026 Arnava Kumar Sinha. All rights reserved.
 */

import { prisma } from "@/server/db";
import { runReceiptAgent } from "@/server/agent/receipt-agent";
import {
  createAgentRun,
  completeAgentRun,
  failAgentRun,
} from "@/server/agent/agent-run";

const RULE_VERSION = "CRA-PROTOTYPE-v1";
const MODEL = "deterministic-receipt-workflow-v1";

export async function processReceipt(receiptId: string) {
  /*
   * STEP 1
   * Claim the receipt and create the AgentRun together
   * in one SHORT transaction.
   *
   * Important:
   * This transaction ends BEFORE the agent starts.
   * Therefore PROCESSING + AgentRun are immediately visible
   * to the status endpoint.
   */
  const claim = await prisma.$transaction(async (tx) => {
    const receipt = await tx.receipt.findUnique({
      where: { id: receiptId },
    });

    if (!receipt) {
      throw new Error("Receipt not found");
    }

    /*
     * Already awaiting human review.
     */
    if (receipt.status === "REVIEW_REQUIRED") {
      const existingApproval = await tx.approval.findFirst({
        where: {
          receiptId: receipt.id,
          status: "PENDING",
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      return {
        type: "REVIEW_REQUIRED" as const,
        receipt,
        approvalId: existingApproval?.id ?? null,
      };
    }

    /*
     * Already completed.
     */
    if (receipt.status === "COMPLETED") {
      return {
        type: "COMPLETED" as const,
        receipt,
      };
    }

    /*
     * Already processing.
     *
     * Find the existing AgentRun inside the SAME transaction.
     */
    if (receipt.status === "PROCESSING") {
      const existingAgentRun = await tx.agentRun.findFirst({
        where: {
          receiptId: receipt.id,
          status: "RUNNING",
        },
        orderBy: {
          startedAt: "desc",
        },
      });

      return {
        type: "PROCESSING" as const,
        receipt,
        agentRun: existingAgentRun,
      };
    }

    /*
     * PENDING or ERROR:
     * claim the receipt and create the AgentRun atomically.
     */
    const updatedReceipt = await tx.receipt.update({
      where: {
        id: receipt.id,
      },
      data: {
        status: "PROCESSING",
      },
    });

    const agentRun = await createAgentRun(
      {
        receiptId: updatedReceipt.id,
        requestId: crypto.randomUUID(),
        provider: "internal",
        model: MODEL,
      },
      tx,
    );

    return {
      type: "START" as const,
      receipt: updatedReceipt,
      agentRun,
    };
  });

  /*
   * STEP 2
   * Handle states that do not require a new run.
   */

  if (claim.type === "REVIEW_REQUIRED") {
    return {
      receiptId: claim.receipt.id,
      status: "REVIEW_REQUIRED" as const,
      approvalId: claim.approvalId,
      message: "Receipt is already awaiting human review.",
    };
  }

  if (claim.type === "COMPLETED") {
    return {
      receiptId: claim.receipt.id,
      status: "COMPLETED" as const,
      message: "Receipt has already been processed and approved.",
    };
  }

  if (claim.type === "PROCESSING") {
    return {
      receiptId: claim.receipt.id,
      agentRunId: claim.agentRun?.id,
      status: "PROCESSING" as const,
      message: claim.agentRun
        ? "Receipt processing is already in progress."
        : "Receipt is already marked as processing.",
    };
  }

  /*
   * From here onward we KNOW this request owns the AgentRun.
   */
  const receipt = claim.receipt;
  const agentRun = claim.agentRun;

  try {
    /*
     * STEP 3
     * Record processing start.
     */
    await prisma.auditEvent.create({
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

    /*
     * STEP 4
     * Run the agent with the NORMAL Prisma client.
     *
     * DO NOT use a long-running transaction here.
     */
    const result = await runReceiptAgent({
      receiptId: receipt.id,
      agentRunId: agentRun.id,
      db: prisma,
    });

    /*
     * STEP 5
     * Persist final receipt state.
     */
    await prisma.receipt.update({
      where: {
        id: receipt.id,
      },
      data: {
        status: result.status === "COMPLETED" ? "COMPLETED" : "REVIEW_REQUIRED",
      },
    });

    /*
     * STEP 6
     * Persist completion audit.
     */
    await prisma.auditEvent.create({
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

    /*
     * STEP 7
     * Complete AgentRun.
     */
    await completeAgentRun(agentRun.id);

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

    /*
     * Mark AgentRun as failed.
     */
    await failAgentRun(agentRun.id, message);

    /*
     * Mark receipt as ERROR so it cannot remain
     * indefinitely in PROCESSING.
     */
    await prisma.receipt.update({
      where: {
        id: receipt.id,
      },
      data: {
        status: "ERROR",
      },
    });

    /*
     * Persist failure audit.
     */
    await prisma.auditEvent.create({
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
}
