import type { DatabaseClient } from "@/server/db/types";
import { executeTool } from "@/server/tools/executor";
import { updateAgentRunState } from "@/server/agent/agent-run";

export type ReceiptAgentContext = {
  receiptId: string;
  agentRunId: string;
  db: DatabaseClient;
};

export type ReceiptAgentResult = {
  receiptId: string;
  status: "COMPLETED" | "REVIEW_REQUIRED";
  classification: string | null;
  gifiCode: string | null;
  gstHstValidationStatus:
    | "missing"
    | "invalid_format"
    | "malformed"
    | "suspicious"
    | "valid_format"
    | "unavailable"
    | null;
  documentationStatus: "sufficient" | "insufficient" | "review" | null;
  itcStatus: "eligible" | "partial" | "ineligible" | "review" | null;
  eligibleItc: number;
  verificationPassed: boolean;
  requiresReview: boolean;
};

type ReceiptData = {
  id: string;
  vendor: string;
  description: string | null;
  total: number;
  taxAmount: number;
  gstHstNumber: string | null;
  commercialUsePercentage: number | null;
  mealExceptionProposal: string | null;
};

type ClassificationData = {
  category: string;
  gifiCode: string | null;
  confidence: number;
  reason: string;
  mealException?:
    "standard" | "charityOrPublicInstitution" | "longHaulTruckDriver" | null;
  mealExceptionRequiresReview?: boolean;
};

type DocumentationData = {
  tier: 1 | 2 | 3;
  status: "sufficient" | "insufficient" | "review";
  reason: string;
};

type GifiData = {
  status: "SUCCESS" | "REVIEW_REQUIRED";
  gifiCode: string | null;
  category: string;
  confidence?: number;
  reason: string;
};

type ItcData = {
  status: "eligible" | "partial" | "ineligible" | "review";
  eligibleITC: number;
};

async function setAgentStep(context: ReceiptAgentContext, step: string) {
  await updateAgentRunState(
    context.agentRunId,
    {
      currentStep: step,
    },
    context.db,
  );
}

export async function runReceiptAgent(
  context: ReceiptAgentContext,
): Promise<ReceiptAgentResult> {
  await setAgentStep(context, "READING_RECEIPT");
  /*
   * STEP 1
   * Read the receipt from application state.
   */
  const receiptTool = await executeTool(
    "get_current_receipt",
    {},
    {
      selectedReceiptId: context.receiptId,
      agentRunId: context.agentRunId,
      db: context.db,
    },
  );

  if (receiptTool.status !== "SUCCESS") {
    throw new Error("Agent could not load the selected receipt.");
  }

  const receiptOutput = receiptTool.output as {
    receipt?: ReceiptData;
  };

  if (!receiptOutput.receipt) {
    throw new Error("Selected receipt was not returned by the receipt tool.");
  }

  const receipt = receiptOutput.receipt;

  await setAgentStep(context, "VALIDATING_GST");

  /*
   * STEP 2
   * Validate GST/HST information.
   */
  const gstTool = await executeTool(
    "validate_gst_hst_number_format",
    {
      receiptId: receipt.id,
      gstHstNumber: receipt.gstHstNumber,
    },
    {
      selectedReceiptId: context.receiptId,
      agentRunId: context.agentRunId,
      db: context.db,
    },
  );

  if (gstTool.status === "FAILURE") {
    throw new Error("GST/HST validation failed.");
  }

  const gstValidation = gstTool.output as {
    status:
      | "missing"
      | "invalid_format"
      | "malformed"
      | "suspicious"
      | "valid_format"
      | "unavailable";
    normalizedNumber: string | null;
    reason: string;
    externallyVerified: false;
  };

  await setAgentStep(context, "VALIDATING_DOCUMENTATION");

  /*
   * STEP 3
   * Evaluate CRA documentation requirements.
   */
  const documentationTool = await executeTool(
    "validate_cra_documentation",
    {
      receiptId: receipt.id,
      total: receipt.total,
      gstHstNumber: receipt.gstHstNumber,
    },
    {
      selectedReceiptId: context.receiptId,
      agentRunId: context.agentRunId,
      db: context.db,
    },
  );

  if (documentationTool.status === "FAILURE" || !documentationTool.output) {
    throw new Error("CRA documentation validation failed.");
  }

  const documentation = documentationTool.output as DocumentationData;

  await setAgentStep(context, "CLASSIFYING_EXPENSE");

  /*
   * STEP 4
   * Classify the expense.
   */
  const classificationTool = await executeTool(
    "classify_expense",
    {
      receiptId: receipt.id,
      vendor: receipt.vendor,
      description: receipt.description,
      mealExceptionProposal: receipt.mealExceptionProposal,
    },
    {
      selectedReceiptId: context.receiptId,
      agentRunId: context.agentRunId,
      db: context.db,
    },
  );

  if (classificationTool.status === "FAILURE" || !classificationTool.output) {
    throw new Error("Expense classification failed.");
  }

  const classification = classificationTool.output as ClassificationData;

  await setAgentStep(context, "VERIFYING_GIFI");

  /*
   * STEP 5
   * Verify the proposed GIFI code against the controlled catalogue.
   */
  const gifiTool = await executeTool(
    "assign_gifi_code",
    {
      receiptId: receipt.id,
      category: classification.category,
      proposedCode: classification.gifiCode,
    },
    {
      selectedReceiptId: context.receiptId,
      agentRunId: context.agentRunId,
      db: context.db,
    },
  );

  if (gifiTool.status === "FAILURE" || !gifiTool.output) {
    throw new Error("GIFI assignment failed.");
  }

  const gifi = gifiTool.output as GifiData;

  /*
   * If classification/GIFI is unresolved,
   * the agent must not invent a result.
   */
  const classificationRequiresReview =
    classification.category === "Unknown" ||
    classification.gifiCode === null ||
    gifi.status === "REVIEW_REQUIRED" ||
    gifi.gifiCode === null ||
    classification.mealExceptionRequiresReview === true;

  /*
   * STEP 6
   * Determine commercial-use eligibility.
   *
   * This remains deterministic business logic.
   */
  const commercialUsePercentage =
    receipt.commercialUsePercentage !== null
      ? receipt.commercialUsePercentage / 100
      : 1;

  let eligibilityPercentage = commercialUsePercentage;

  if (classification.category === "Meals and Entertainment") {
    const mealPercentage =
      classification.mealException === "charityOrPublicInstitution"
        ? 1
        : classification.mealException === "longHaulTruckDriver"
          ? 0.8
          : 0.5;

    eligibilityPercentage = commercialUsePercentage * mealPercentage;
  }

  await setAgentStep(context, "CALCULATING_ITC");

  /*
   * STEP 7
   * Calculate ITC only when classification is sufficiently resolved.
   */
  let itc: ItcData;

  if (classificationRequiresReview) {
    itc = {
      status: "review",
      eligibleITC: 0,
    };
  } else {
    const itcTool = await executeTool(
      "calculate_eligible_itc",
      {
        receiptId: receipt.id,
        taxAmount: receipt.taxAmount,
        eligibilityPercentage,
        documentationStatus: documentation.status,
      },
      {
        selectedReceiptId: context.receiptId,
        agentRunId: context.agentRunId,
        db: context.db,
      },
    );

    if (itcTool.status === "FAILURE" || !itcTool.output) {
      throw new Error("ITC calculation failed.");
    }

    const output = itcTool.output as {
      status: ItcData["status"];
      eligibleITC: number;
    };

    itc = {
      status: output.status,
      eligibleITC: output.eligibleITC,
    };
  }
  await setAgentStep(context, "VERIFYING_RESULT");
  const verification = verifyResult({
    taxAmount: receipt.taxAmount,
    eligibilityPercentage,
    eligibleItc: itc.eligibleITC,
    gifiCode: gifi.status === "SUCCESS" ? gifi.gifiCode : null,
    category: classification.category,
    documentationStatus: documentation.status,
  });

  await context.db.toolCall.create({
    data: {
      agentRunId: context.agentRunId,
      toolName: "self_verification",
      input: {
        receiptId: receipt.id,
        category: classification.category,
        gifiCode: gifi.status === "SUCCESS" ? gifi.gifiCode : null,
        eligibleItc: itc.eligibleITC,
      },
      output: verification,
      status: "SUCCESS",
      completedAt: new Date(),
    },
  });

  /*
   * STEP 8
   * Decide whether human review is required.
   */
  const requiresReview =
    !verification.valid ||
    classificationRequiresReview ||
    documentation.status !== "sufficient" ||
    itc.status === "review";

  /*
   * STEP 9
   * Persist the agent's resulting classification.
   */
  const classificationStatus = requiresReview
    ? "REVIEW_REQUIRED"
    : "CLASSIFIED";

  const itcStatus =
    itc.status === "eligible"
      ? "ELIGIBLE"
      : itc.status === "partial"
        ? "PARTIAL"
        : itc.status === "ineligible"
          ? "INELIGIBLE"
          : "REVIEW";

  await setAgentStep(context, "UPDATING_CLASSIFICATION");
  const updateTool = await executeTool(
    "update_expense_classification",
    {
      receiptId: receipt.id,
      category: classification.category,
      gifiCode: gifi.status === "SUCCESS" ? gifi.gifiCode : null,
      mealException:
        requiresReview || classification.category !== "Meals and Entertainment"
          ? null
          : (classification.mealException ?? "standard"),
      commercialUsePercentage: commercialUsePercentage * 100,
      grossTax: receipt.taxAmount,
      eligibilityPercentage,
      eligibleItc: itc.eligibleITC,
      itcStatus,
      classificationStatus,
      confidence: classification.confidence,
      reason: `${classification.reason} ${documentation.reason}`,
    },
    {
      selectedReceiptId: context.receiptId,
      agentRunId: context.agentRunId,
      db: context.db,
    },
  );

  if (updateTool.status === "FAILURE" || !updateTool.output) {
    throw new Error("Failed to persist expense classification.");
  }

  /*
   * STEP 10
   * Human review is an explicit agent action.
   */
  if (requiresReview) {
    await setAgentStep(context, "REQUESTING_HUMAN_REVIEW");

    const reviewTool = await executeTool(
      "request_human_review",
      {
        receiptId: receipt.id,
        agentRunId: context.agentRunId,
        proposedCategory: classification.category,
        proposedGifiCode:
          gifi.status === "SUCCESS" ? gifi.gifiCode : classification.gifiCode,
        proposedMealException: classification.mealException ?? null,
        proposedItc: itc.eligibleITC,
        reason:
          documentation.status !== "sufficient"
            ? documentation.reason
            : "Classification or GIFI mapping requires human review.",
      },
      {
        selectedReceiptId: context.receiptId,
        agentRunId: context.agentRunId,
        db: context.db,
      },
    );

    if (reviewTool.status === "FAILURE" || !reviewTool.output) {
      throw new Error("Failed to create human-review request.");
    }
  }

  return {
    receiptId: receipt.id,
    status: requiresReview ? "REVIEW_REQUIRED" : "COMPLETED",
    classification: classification.category,
    gifiCode: gifi.status === "SUCCESS" ? gifi.gifiCode : null,
    gstHstValidationStatus: gstValidation.status,
    documentationStatus: documentation.status,
    itcStatus: itc.status,
    eligibleItc: itc.eligibleITC,
    verificationPassed: verification.valid,
    requiresReview,
  };
}

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
