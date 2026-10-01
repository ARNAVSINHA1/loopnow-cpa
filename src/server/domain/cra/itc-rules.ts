import { z } from "zod";

export const DocumentationStatusSchema = z.enum([
  "sufficient",
  "insufficient",
  "review",
]);

export type DocumentationStatus =
  z.infer<typeof DocumentationStatusSchema>;

export const CalculateITCInputSchema = z.object({
  receiptId: z.string(),
  taxAmount: z.number().nonnegative(),
  eligibilityPercentage: z.number().min(0).max(1),
  documentationStatus: DocumentationStatusSchema,
});

export type CalculateITCInput = z.infer<
  typeof CalculateITCInputSchema
>;

export type ITCResult = {
  status: "eligible" | "partial" | "ineligible" | "review";
  receiptId: string;
  grossTax: number;
  eligibilityPercentage: number;
  eligibleITC: number;
  ruleApplied: string;
  documentation: {
    status: DocumentationStatus;
  };
  source: "CRA_RULE_ENGINE";
};

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateEligibleITC(
  input: CalculateITCInput,
): ITCResult {
  const parsed = CalculateITCInputSchema.parse(input);

  if (parsed.documentationStatus !== "sufficient") {
    return {
      status: "review",
      receiptId: parsed.receiptId,
      grossTax: money(parsed.taxAmount),
      eligibilityPercentage: parsed.eligibilityPercentage,
      eligibleITC: 0,
      ruleApplied: "DOCUMENTATION_REVIEW",
      documentation: {
        status: parsed.documentationStatus,
      },
      source: "CRA_RULE_ENGINE",
    };
  }

  const eligibleITC = money(
    parsed.taxAmount * parsed.eligibilityPercentage,
  );

  let status: ITCResult["status"];

  if (parsed.eligibilityPercentage === 0) {
    status = "ineligible";
  } else if (parsed.eligibilityPercentage === 1) {
    status = "eligible";
  } else {
    status = "partial";
  }

  return {
    status,
    receiptId: parsed.receiptId,
    grossTax: money(parsed.taxAmount),
    eligibilityPercentage: parsed.eligibilityPercentage,
    eligibleITC,
    ruleApplied: "STANDARD_ITC",
    documentation: {
      status: parsed.documentationStatus,
    },
    source: "CRA_RULE_ENGINE",
  };
}