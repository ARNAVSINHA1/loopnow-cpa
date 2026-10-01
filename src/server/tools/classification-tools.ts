import { classifyExpense } from "@/server/domain/classification/classification-rules";
import {
  findGifiCode,
  findGifiForCategory,
} from "@/server/domain/gifi/gifi-rules";
import {
  AssignGifiCodeInputSchema,
  AssignGifiCodeToolResultSchema,
  ClassifyExpenseInputSchema,
  ClassificationToolResultSchema,
  type AssignGifiCodeInput,
  type ClassifyExpenseInput,
} from "./contracts";

export async function classifyExpenseTool(input: ClassifyExpenseInput) {
  const parsed = ClassifyExpenseInputSchema.parse(input);

  return ClassificationToolResultSchema.parse(
    classifyExpense({
      vendor: parsed.vendor,
      description: parsed.description,
      mealExceptionProposal: parsed.mealExceptionProposal,
    }),
  );
}

export async function assignGifiCode(input: AssignGifiCodeInput) {
  const parsed = AssignGifiCodeInputSchema.parse(input);

  /*
   * If the agent proposes a specific GIFI code,
   * verify that code against the controlled catalogue.
   */
  if (parsed.proposedCode) {
    const proposed = findGifiCode(parsed.proposedCode);

    if (!proposed) {
      return {
        status: "REVIEW_REQUIRED" as const,
        receiptId: parsed.receiptId,
        category: parsed.category,
        gifiCode: null,
        reason: `Proposed GIFI code ${parsed.proposedCode} does not exist in the controlled catalogue.`,
      };
    }

    /*
     * The code must also correspond to the proposed category.
     */
    if (
      proposed.category.trim().toLowerCase() !==
      parsed.category.trim().toLowerCase()
    ) {
      return {
        status: "REVIEW_REQUIRED" as const,
        receiptId: parsed.receiptId,
        category: parsed.category,
        gifiCode: null,
        reason:
          "The proposed GIFI code exists but does not match the proposed expense category.",
      };
    }

    return {
      status: "SUCCESS" as const,
      receiptId: parsed.receiptId,
      category: parsed.category,
      gifiCode: proposed.code,
      description: proposed.description,
      confidence: proposed.confidence,
      source: proposed.source,
      reason:
        "Proposed GIFI code was verified against the controlled catalogue.",
    };
  }

  /*
   * No proposed code: derive one from the controlled category catalogue.
   */
  const candidate = findGifiForCategory(parsed.category);

  if (!candidate) {
    return {
      status: "REVIEW_REQUIRED" as const,
      receiptId: parsed.receiptId,
      category: parsed.category,
      gifiCode: null,
      reason:
        "No GIFI code could be verified for the proposed expense category.",
    };
  }

  return AssignGifiCodeToolResultSchema.parse({
    status: "SUCCESS" as const,
    receiptId: parsed.receiptId,
    category: parsed.category,
    gifiCode: candidate.code,
    description: candidate.description,
    confidence: candidate.confidence,
    source: candidate.source,
    reason: "GIFI code was resolved from the controlled catalogue.",
  });
}
