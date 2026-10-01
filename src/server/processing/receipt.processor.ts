import { prisma } from "@/server/db";
import { executeTool } from "@/server/tools/executor";
import { evaluateDocumentation } from "@/server/domain/cra/documentation-rules";
import { validateGstHstNumber } from "@/server/domain/cra/gst-hst-rules";
import { calculateEligibleITC } from "@/server/domain/cra/itc-rules";
import { findGifiForCategory } from "@/server/domain/gifi/gifi-rules";
import { classifyExpense } from "@/server/domain/classification/classification-rules";
import {
  getMealITCPercentage,
  type MealITCException,
} from "../domain/cra/meals-rules";

const RULE_VERSION = "CRA-PROTOTYPE-v1";
const MODEL = "cpa-copilot-v1";

function verifyResult(input: {
  taxAmount: number;
  eligibilityPercentage: number;
  eligibleItc: number;
  gifiCode: string | null;
  category: string;
  documentationStatus: "sufficient" | "insufficient" | "review";
}): {
  valid: boolean;
  reason: string;
} {
  if (input.gifiCode === null) {
    return {
      valid: false,
      reason: "GIFI mapping is unresolved.",
    };
  }

  if (input.category === "Unknown") {
    return {
      valid: false,
      reason: "Expense classification is unresolved.",
    };
  }

  /*
   * When documentation is insufficient/review,
   * the ITC engine intentionally returns zero.
   * That is a valid deterministic outcome, not
   * an arithmetic verification failure.
   */
  if (input.documentationStatus !== "sufficient") {
    if (input.eligibleItc !== 0) {
      return {
        valid: false,
        reason:
          "ITC should be zero when documentation is insufficient or requires review.",
      };
    }

    return {
      valid: true,
      reason:
        "Documentation review correctly prevented ITC from being claimed.",
    };
  }

  const expectedItc =
    Math.round(
      (input.taxAmount * input.eligibilityPercentage + Number.EPSILON) * 100,
    ) / 100;

  if (Math.abs(expectedItc - input.eligibleItc) > 0.01) {
    return {
      valid: false,
      reason: "Eligible ITC failed deterministic arithmetic verification.",
    };
  }

  return {
    valid: true,
    reason:
      "Classification, GIFI mapping and ITC arithmetic passed verification.",
  };
}

export async function processReceipt(receiptId: string) {
  return prisma.$transaction(async (tx) => {
    const receipt = await tx.receipt.findUnique({
      where: {
        id: receiptId,
      },
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
        orderBy: {
          createdAt: "desc",
        },
      });

      if (existingApproval) {
        return {
          receiptId: receipt.id,
          status: "REVIEW_REQUIRED",
          approvalId: existingApproval.id,
          message: "Receipt is already awaiting human review.",
        };
      }
    }

    /*
     * Idempotency:
     * A completed receipt must not be processed again.
     */
    if (receipt.status === "COMPLETED") {
      return {
        receiptId: receipt.id,
        status: "COMPLETED",
        message: "Receipt has already been processed and approved.",
      };
    }

    const agentRun = await tx.agentRun.create({
      data: {
        receiptId: receipt.id,
        requestId: crypto.randomUUID(),
        provider: "internal",
        model: MODEL,
        status: "RUNNING",
      },
    });

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

      /*
       * STEP 1: Validate receipt data
       */
      const currentReceiptTool = await executeTool(
        "get_current_receipt",
        {},
        {
          selectedReceiptId: receipt.id,
          agentRunId: agentRun.id,
          db: tx,
        },
      );

      if (currentReceiptTool.status !== "SUCCESS") {
        throw new Error(
          `Failed to load selected receipt: ${JSON.stringify(
            currentReceiptTool.output,
          )}`,
        );
      }

      /*
       * STEP 2: GST/HST registration-number format validation
       *
       * This is deterministic format validation only.
       * A valid format does NOT prove CRA registration.
       */
      const gstValidationTool = await executeTool(
        "validate_gst_hst_number_format",
        {
          receiptId: receipt.id,
          gstHstNumber: receipt.gstHstNumber,
        },
        {
          selectedReceiptId: receipt.id,
          agentRunId: agentRun.id,
          db: tx,
        },
      );

      if (gstValidationTool.status === "FAILURE" || !gstValidationTool.output) {
        throw new Error("GST/HST validation tool failed.");
      }

      const gstHstValidation = gstValidationTool.output as {
        status: "missing" | "invalid_format" | "valid_format" | "unavailable";
        normalizedNumber: string | null;
        reason: string;
        externallyVerified: false;
      };

      /*
       * STEP 3: CRA documentation evaluation
       */
      const documentation = evaluateDocumentation({
        total: Number(receipt.total),
        gstHstNumber: receipt.gstHstNumber,
      });

      await tx.toolCall.create({
        data: {
          agentRunId: agentRun.id,
          toolName: "documentation_rules",
          input: {
            receiptId: receipt.id,
            total: receipt.total.toString(),
            gstHstNumberPresent: Boolean(receipt.gstHstNumber),
          },
          output: documentation,
          status: "SUCCESS",
          completedAt: new Date(),
        },
      });

      /*
       * STEP 4: Expense classification
       */
      const classification = classifyExpense({
        vendor: receipt.vendor,
        description: receipt.description,
      });

      await tx.toolCall.create({
        data: {
          agentRunId: agentRun.id,
          toolName: "expense_classification",
          input: {
            receiptId: receipt.id,
            vendor: receipt.vendor,
            description: receipt.description,
          },
          output: classification,
          status: "SUCCESS",
          completedAt: new Date(),
        },
      });

      /*
       * STEP 5: GIFI mapping
       */
      const gifi = classification.gifiCode
        ? findGifiForCategory(classification.category)
        : null;

      await tx.toolCall.create({
        data: {
          agentRunId: agentRun.id,
          toolName: "gifi_mapping",
          input: {
            category: classification.category,
            proposedCode: classification.gifiCode,
          },
          output: gifi ?? undefined,
          status: "SUCCESS",
          completedAt: new Date(),
        },
      });

      /*
       * STEP 6: Determine eligibility percentage
       *
       * For this prototype, commercial use defaults to 100%.
       * If the receipt explicitly contains a commercial-use percentage,
       * that value is used.
       */
      const commercialUsePercentage =
        receipt.commercialUsePercentage !== null &&
        receipt.commercialUsePercentage !== undefined
          ? Number(receipt.commercialUsePercentage) / 100
          : 1;

      let eligibilityPercentage = commercialUsePercentage;

      if (classification.category === "Meals and Entertainment") {
        const mealPercentage = getMealITCPercentage(
          classification.mealException ?? "standard",
        );

        eligibilityPercentage = commercialUsePercentage * mealPercentage;
      }

      /*
       * STEP 7: Deterministic ITC calculation
       */
      const classificationRequiresReview =
        classification.category === "Unknown" ||
        classification.gifiCode === null ||
        gifi === null;

      const itc = classificationRequiresReview
        ? {
            status: "review" as const,
            receiptId: receipt.id,
            grossTax: Number(receipt.taxAmount),
            eligibilityPercentage,
            eligibleITC: 0,
            ruleApplied: "CLASSIFICATION_REVIEW",
            documentation: {
              status: documentation.status,
            },
            source: "CRA_RULE_ENGINE" as const,
          }
        : calculateEligibleITC({
            receiptId: receipt.id,
            taxAmount: Number(receipt.taxAmount),
            eligibilityPercentage,
            documentationStatus: documentation.status,
          });

      await tx.toolCall.create({
        data: {
          agentRunId: agentRun.id,
          toolName: "itc_calculation",
          input: {
            receiptId: receipt.id,
            taxAmount: receipt.taxAmount.toString(),
            eligibilityPercentage,
            documentationStatus: documentation.status,
          },
          output: itc,
          status: "SUCCESS",
          completedAt: new Date(),
        },
      });

      /*
       * STEP 8: Self verification
       */
      const verification = verifyResult({
        taxAmount: Number(receipt.taxAmount),
        eligibilityPercentage,
        eligibleItc: itc.eligibleITC,
        gifiCode: gifi?.code ?? null,
        category: classification.category,
        documentationStatus: documentation.status,
      });

      await tx.toolCall.create({
        data: {
          agentRunId: agentRun.id,
          toolName: "self_verification",
          input: {
            receiptId: receipt.id,
            category: classification.category,
            gifiCode: gifi?.code ?? null,
            eligibleItc: itc.eligibleITC,
          },
          output: verification,
          status: "SUCCESS",
          completedAt: new Date(),
        },
      });

      /*
       * STEP 9: Decide final workflow status
       */
      const requiresReview =
        !verification.valid ||
        documentation.status !== "sufficient" ||
        classification.gifiCode === null ||
        itc.status === "review";

      const finalReceiptStatus = requiresReview
        ? "REVIEW_REQUIRED"
        : "COMPLETED";

      const classificationStatus = requiresReview
        ? "REVIEW_REQUIRED"
        : "CLASSIFIED";

      /*
       * STEP 10: Persist Expense
       */
      await tx.expense.upsert({
        where: {
          receiptId: receipt.id,
        },
        create: {
          receiptId: receipt.id,
          category: classification.category,
          gifiCode: gifi?.code ?? null,
          commercialUsePercentage: commercialUsePercentage * 100,
          grossTax: Number(receipt.taxAmount),
          eligibilityPercentage,
          eligibleItc: itc.eligibleITC,
          itcStatus:
            itc.status === "eligible"
              ? "ELIGIBLE"
              : itc.status === "partial"
                ? "PARTIAL"
                : itc.status === "ineligible"
                  ? "INELIGIBLE"
                  : "REVIEW",
          classificationStatus,
          confidence: classification.confidence,
          reason: `${classification.reason} ${documentation.reason}`,
        },
        update: {
          category: classification.category,
          gifiCode: gifi?.code ?? null,
          commercialUsePercentage: commercialUsePercentage * 100,
          grossTax: Number(receipt.taxAmount),
          eligibilityPercentage,
          eligibleItc: itc.eligibleITC,
          itcStatus:
            itc.status === "eligible"
              ? "ELIGIBLE"
              : itc.status === "partial"
                ? "PARTIAL"
                : itc.status === "ineligible"
                  ? "INELIGIBLE"
                  : "REVIEW",
          classificationStatus,
          confidence: classification.confidence,
          reason: `${classification.reason} ${documentation.reason}`,
        },
      });

      /*
       * STEP 11: Create approval task when human review is required
       */
      if (requiresReview) {
        await tx.approval.create({
          data: {
            receiptId: receipt.id,
            agentRunId: agentRun.id,
            status: "PENDING",
            proposedCategory: classification.category,
            proposedGifiCode: gifi?.code ?? classification.gifiCode,
            proposedItc: itc.eligibleITC,
            reason: !verification.valid
              ? verification.reason
              : documentation.reason,
          },
        });
      }

      /*
       * STEP 12: Persist final receipt status
       */
      await tx.receipt.update({
        where: {
          id: receipt.id,
        },
        data: {
          status: finalReceiptStatus,
        },
      });

      /*
       * STEP 13: Audit completion
       */
      await tx.auditEvent.create({
        data: {
          actor: "system",
          receiptId: receipt.id,
          agentRunId: agentRun.id,
          action: "PROCESSING_COMPLETED",
          ruleVersion: RULE_VERSION,
          model: MODEL,
          status: requiresReview ? "REVIEW_REQUIRED" : "SUCCESS",
          metadata: {
            validationToolCallId: gstValidationTool.toolCallId,
            gstHstValidationStatus: gstHstValidation.status,
            gstHstNumber: gstHstValidation.normalizedNumber,
            classification: classification.category,
            gifiCode: gifi?.code ?? null,
            documentationStatus: documentation.status,
            itcStatus: itc.status,
            eligibleItc: itc.eligibleITC,
            verificationPassed: verification.valid,
          },
        },
      });

      await tx.agentRun.update({
        where: {
          id: agentRun.id,
        },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
        },
      });

      return {
        receiptId: receipt.id,
        agentRunId: agentRun.id,
        status: finalReceiptStatus,
        classification: classification.category,
        gifiCode: gifi?.code ?? null,
        documentationStatus: documentation.status,
        itcStatus: itc.status,
        eligibleItc: itc.eligibleITC,
        requiresReview,
      };
    } catch (error) {
      await tx.agentRun.update({
        where: {
          id: agentRun.id,
        },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          error:
            error instanceof Error ? error.message : "Unknown processing error",
        },
      });

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
            error:
              error instanceof Error
                ? error.message
                : "Unknown processing error",
          },
        },
      });

      throw error;
    }
  });
}
