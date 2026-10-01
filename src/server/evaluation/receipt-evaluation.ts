import { classifyExpense } from "@/server/domain/classification/classification-rules";
import { evaluateDocumentation } from "@/server/domain/cra/documentation-rules";
import {
  calculateDeterministicEligibilityPercentage,
  calculateDeterministicItcLimit,
} from "@/server/approvals/review-validation";
import { findGifiCode } from "@/server/domain/gifi/gifi-rules";
import { isMealITCException } from "@/server/domain/cra/meals-rules";

export type ReceiptEvaluationInput = {
  vendor: string;
  description?: string | null;
  total: number;
  taxAmount: number;
  gstHstNumber?: string | null;
  commercialUsePercentage?: number;
  mealException?: string;
  proposedGifiCode?: string;
};

export type ReceiptEvaluationResult = {
  classification: string;
  gifiCode: string | null;
  documentationStatus: "sufficient" | "insufficient" | "review";
  eligibilityPercentage: number;
  eligibleItc: number;
  requiresReview: boolean;
};

export type ReceiptEvaluationCase = {
  name: string;
  input: ReceiptEvaluationInput;
  expected: ReceiptEvaluationResult;
};

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function runEvaluationCase(
  input: ReceiptEvaluationInput,
): ReceiptEvaluationResult {
  const classification = classifyExpense({
    vendor: input.vendor,
    description: input.description,
  });

  const documentation = evaluateDocumentation({
    total: input.total,
    gstHstNumber: input.gstHstNumber,
  });

  const commercialUse =
    input.commercialUsePercentage === undefined
      ? 100
      : Math.max(0, Math.min(100, input.commercialUsePercentage));

  const proposedGifi = input.proposedGifiCode
    ? findGifiCode(input.proposedGifiCode)
    : null;
  const gifiCode = input.proposedGifiCode
    ? proposedGifi?.category === classification.category
      ? proposedGifi.code
      : null
    : classification.gifiCode;
  const mealException = input.mealException ?? "standard";
  const mealExceptionValid =
    classification.category !== "Meals and Entertainment" ||
    isMealITCException(mealException);
  const eligibilityPercentage = mealExceptionValid
    ? calculateDeterministicEligibilityPercentage(
        commercialUse,
        classification.category,
        classification.category === "Meals and Entertainment"
          ? (mealException as
              "standard" | "charityOrPublicInstitution" | "longHaulTruckDriver")
          : null,
      )
    : 0;

  const eligibleItc =
    documentation.status === "sufficient" &&
    gifiCode !== null &&
    mealExceptionValid
      ? roundMoney(input.taxAmount * eligibilityPercentage)
      : 0;

  const serverLimit = calculateDeterministicItcLimit(
    input.taxAmount,
    commercialUse,
    classification.category,
    mealException,
  );

  const requiresReview =
    classification.category === "Unknown" ||
    gifiCode === null ||
    !mealExceptionValid ||
    documentation.status !== "sufficient" ||
    eligibleItc !== serverLimit;

  return {
    classification: classification.category,
    gifiCode,
    documentationStatus: documentation.status,
    eligibilityPercentage: roundMoney(eligibilityPercentage),
    eligibleItc,
    requiresReview,
  };
}

export const evaluationCases: ReceiptEvaluationCase[] = [
  {
    name: "office-supplies-basic",
    input: {
      vendor: "Staples",
      description: "Office supplies - printer paper and notebooks",
      total: 95,
      taxAmount: 12,
      gstHstNumber: "123456789RT0001",
      commercialUsePercentage: 100,
    },
    expected: {
      classification: "Office Expenses",
      gifiCode: "8810",
      documentationStatus: "sufficient",
      eligibilityPercentage: 1,
      eligibleItc: 12,
      requiresReview: false,
    },
  },
  {
    name: "meal-standard-50",
    input: {
      vendor: "Keg",
      description: "Client meal and dinner",
      total: 120,
      taxAmount: 12,
      gstHstNumber: "123456789RT0001",
      commercialUsePercentage: 100,
    },
    expected: {
      classification: "Meals and Entertainment",
      gifiCode: "8523",
      documentationStatus: "sufficient",
      eligibilityPercentage: 0.5,
      eligibleItc: 6,
      requiresReview: false,
    },
  },
  {
    name: "meal-long-haul-prose-does-not-authorize-exception",
    input: {
      vendor: "Truck Stop Cafe",
      description: "Long-haul truck driver meal",
      total: 140,
      taxAmount: 12,
      gstHstNumber: "123456789RT0001",
      commercialUsePercentage: 100,
    },
    expected: {
      classification: "Meals and Entertainment",
      gifiCode: "8523",
      documentationStatus: "sufficient",
      eligibilityPercentage: 0.5,
      eligibleItc: 6,
      requiresReview: false,
    },
  },
  {
    name: "missing-gst-tier-2",
    input: {
      vendor: "Staples",
      description: "Paper supplier",
      total: 75,
      taxAmount: 10,
      gstHstNumber: null,
      commercialUsePercentage: 100,
    },
    expected: {
      classification: "Office Expenses",
      gifiCode: "8810",
      documentationStatus: "insufficient",
      eligibilityPercentage: 1,
      eligibleItc: 0,
      requiresReview: true,
    },
  },
  {
    name: "valid-gst-format",
    input: {
      vendor: "Staples",
      description: "Office supplies",
      total: 60,
      taxAmount: 5,
      gstHstNumber: "123456789RT0001",
      commercialUsePercentage: 100,
    },
    expected: {
      classification: "Office Expenses",
      gifiCode: "8810",
      documentationStatus: "sufficient",
      eligibilityPercentage: 1,
      eligibleItc: 5,
      requiresReview: false,
    },
  },
  {
    name: "invalid-gst-format",
    input: {
      vendor: "Staples",
      description: "Office supplies",
      total: 60,
      taxAmount: 5,
      gstHstNumber: "123456789",
      commercialUsePercentage: 100,
    },
    expected: {
      classification: "Office Expenses",
      gifiCode: "8810",
      documentationStatus: "insufficient",
      eligibilityPercentage: 1,
      eligibleItc: 0,
      requiresReview: true,
    },
  },
  {
    name: "malformed-gst",
    input: {
      vendor: "Staples",
      description: "Office supplies",
      total: 60,
      taxAmount: 5,
      gstHstNumber: "123456789XX0001",
      commercialUsePercentage: 100,
    },
    expected: {
      classification: "Office Expenses",
      gifiCode: "8810",
      documentationStatus: "insufficient",
      eligibilityPercentage: 1,
      eligibleItc: 0,
      requiresReview: true,
    },
  },
  {
    name: "suspicious-gst",
    input: {
      vendor: "Staples",
      description: "Office supplies",
      total: 60,
      taxAmount: 5,
      gstHstNumber: "000000000RT0000",
      commercialUsePercentage: 100,
    },
    expected: {
      classification: "Office Expenses",
      gifiCode: "8810",
      documentationStatus: "insufficient",
      eligibilityPercentage: 1,
      eligibleItc: 0,
      requiresReview: true,
    },
  },
  {
    name: "unavailable-gst",
    input: {
      vendor: "Staples",
      description: "Office supplies",
      total: 60,
      taxAmount: 5,
      gstHstNumber: "unavailable",
      commercialUsePercentage: 100,
    },
    expected: {
      classification: "Office Expenses",
      gifiCode: "8810",
      documentationStatus: "review",
      eligibilityPercentage: 1,
      eligibleItc: 0,
      requiresReview: true,
    },
  },
  {
    name: "tier-1-29-99",
    input: {
      vendor: "Office Depot",
      description: "Ink",
      total: 29.99,
      taxAmount: 2.5,
      gstHstNumber: "123456789RT0001",
      commercialUsePercentage: 100,
    },
    expected: {
      classification: "Office Expenses",
      gifiCode: "8810",
      documentationStatus: "sufficient",
      eligibilityPercentage: 1,
      eligibleItc: 2.5,
      requiresReview: false,
    },
  },
  {
    name: "tier-2-30-00",
    input: {
      vendor: "Office Depot",
      description: "Stationery",
      total: 30,
      taxAmount: 2.5,
      gstHstNumber: "123456789RT0001",
      commercialUsePercentage: 100,
    },
    expected: {
      classification: "Office Expenses",
      gifiCode: "8810",
      documentationStatus: "sufficient",
      eligibilityPercentage: 1,
      eligibleItc: 2.5,
      requiresReview: false,
    },
  },
  {
    name: "tier-2-149-99",
    input: {
      vendor: "Office Depot",
      description: "Stationery",
      total: 149.99,
      taxAmount: 12.5,
      gstHstNumber: "123456789RT0001",
      commercialUsePercentage: 100,
    },
    expected: {
      classification: "Office Expenses",
      gifiCode: "8810",
      documentationStatus: "sufficient",
      eligibilityPercentage: 1,
      eligibleItc: 12.5,
      requiresReview: false,
    },
  },
  {
    name: "tier-3-150-00",
    input: {
      vendor: "Office Depot",
      description: "Stationery",
      total: 150,
      taxAmount: 12.5,
      gstHstNumber: "123456789RT0001",
      commercialUsePercentage: 100,
    },
    expected: {
      classification: "Office Expenses",
      gifiCode: "8810",
      documentationStatus: "sufficient",
      eligibilityPercentage: 1,
      eligibleItc: 12.5,
      requiresReview: false,
    },
  },
  {
    name: "commercial-use-0",
    input: {
      vendor: "Staples",
      description: "Office supplies",
      total: 50,
      taxAmount: 5,
      gstHstNumber: "123456789RT0001",
      commercialUsePercentage: 0,
    },
    expected: {
      classification: "Office Expenses",
      gifiCode: "8810",
      documentationStatus: "sufficient",
      eligibilityPercentage: 0,
      eligibleItc: 0,
      requiresReview: false,
    },
  },
  {
    name: "commercial-use-50",
    input: {
      vendor: "Staples",
      description: "Office supplies",
      total: 50,
      taxAmount: 5,
      gstHstNumber: "123456789RT0001",
      commercialUsePercentage: 50,
    },
    expected: {
      classification: "Office Expenses",
      gifiCode: "8810",
      documentationStatus: "sufficient",
      eligibilityPercentage: 0.5,
      eligibleItc: 2.5,
      requiresReview: false,
    },
  },
  {
    name: "commercial-use-100",
    input: {
      vendor: "Staples",
      description: "Office supplies",
      total: 50,
      taxAmount: 5,
      gstHstNumber: "123456789RT0001",
      commercialUsePercentage: 100,
    },
    expected: {
      classification: "Office Expenses",
      gifiCode: "8810",
      documentationStatus: "sufficient",
      eligibilityPercentage: 1,
      eligibleItc: 5,
      requiresReview: false,
    },
  },
  {
    name: "unknown-classification",
    input: {
      vendor: "Mystery vendor",
      description: "Unrecognized line item",
      total: 80,
      taxAmount: 8,
      gstHstNumber: "123456789RT0001",
      commercialUsePercentage: 100,
    },
    expected: {
      classification: "Unknown",
      gifiCode: null,
      documentationStatus: "sufficient",
      eligibilityPercentage: 0,
      eligibleItc: 0,
      requiresReview: true,
    },
  },
  {
    name: "zero-tax",
    input: {
      vendor: "Staples",
      description: "Paper",
      total: 20,
      taxAmount: 0,
      gstHstNumber: "123456789RT0001",
      commercialUsePercentage: 100,
    },
    expected: {
      classification: "Office Expenses",
      gifiCode: "8810",
      documentationStatus: "sufficient",
      eligibilityPercentage: 1,
      eligibleItc: 0,
      requiresReview: false,
    },
  },
  {
    name: "partial-eligibility",
    input: {
      vendor: "Staples",
      description: "Office supplies",
      total: 50,
      taxAmount: 10,
      gstHstNumber: "123456789RT0001",
      commercialUsePercentage: 75,
    },
    expected: {
      classification: "Office Expenses",
      gifiCode: "8810",
      documentationStatus: "sufficient",
      eligibilityPercentage: 0.75,
      eligibleItc: 7.5,
      requiresReview: false,
    },
  },
  {
    name: "cash-deposit",
    input: {
      vendor: "Cash Deposit",
      description: "Cash deposit for office supplies",
      total: 40,
      taxAmount: 3,
      gstHstNumber: "123456789RT0001",
      commercialUsePercentage: 100,
    },
    expected: {
      classification: "Unknown",
      gifiCode: null,
      documentationStatus: "sufficient",
      eligibilityPercentage: 0,
      eligibleItc: 0,
      requiresReview: true,
    },
  },
  {
    name: "large-expense-approval",
    input: {
      vendor: "Staples",
      description: "Large office equipment order",
      total: 250,
      taxAmount: 20,
      gstHstNumber: "123456789RT0001",
      commercialUsePercentage: 100,
    },
    expected: {
      classification: "Office Expenses",
      gifiCode: "8810",
      documentationStatus: "sufficient",
      eligibilityPercentage: 1,
      eligibleItc: 20,
      requiresReview: false,
    },
  },
  {
    name: "human-review-case",
    input: {
      vendor: "Local restaurant",
      description: "Meal with unclear business purpose",
      total: 70,
      taxAmount: 8,
      gstHstNumber: "unavailable",
      commercialUsePercentage: 100,
    },
    expected: {
      classification: "Meals and Entertainment",
      gifiCode: "8523",
      documentationStatus: "review",
      eligibilityPercentage: 0.5,
      eligibleItc: 0,
      requiresReview: true,
    },
  },
  {
    name: "ordinary-meal-12-itc-6",
    input: {
      vendor: "Keg",
      description: "Ordinary client meal",
      total: 80,
      taxAmount: 12,
      gstHstNumber: "123456789RT0001",
      commercialUsePercentage: 100,
    },
    expected: {
      classification: "Meals and Entertainment",
      gifiCode: "8523",
      documentationStatus: "sufficient",
      eligibilityPercentage: 0.5,
      eligibleItc: 6,
      requiresReview: false,
    },
  },
  {
    name: "charity-public-institution-meal",
    input: {
      vendor: "Keg",
      description: "Meal",
      total: 80,
      taxAmount: 12,
      gstHstNumber: "123456789RT0001",
      commercialUsePercentage: 100,
      mealException: "charityOrPublicInstitution",
    },
    expected: {
      classification: "Meals and Entertainment",
      gifiCode: "8523",
      documentationStatus: "sufficient",
      eligibilityPercentage: 1,
      eligibleItc: 12,
      requiresReview: false,
    },
  },
  {
    name: "long-haul-truck-driver-meal",
    input: {
      vendor: "Keg",
      description: "Meal",
      total: 80,
      taxAmount: 12,
      gstHstNumber: "123456789RT0001",
      commercialUsePercentage: 100,
      mealException: "longHaulTruckDriver",
    },
    expected: {
      classification: "Meals and Entertainment",
      gifiCode: "8523",
      documentationStatus: "sufficient",
      eligibilityPercentage: 0.8,
      eligibleItc: 9.6,
      requiresReview: false,
    },
  },
  {
    name: "ambiguous-gifi-category-mismatch",
    input: {
      vendor: "Staples",
      description: "Office supplies",
      total: 80,
      taxAmount: 12,
      gstHstNumber: "123456789RT0001",
      commercialUsePercentage: 100,
      proposedGifiCode: "8523",
    },
    expected: {
      classification: "Office Expenses",
      gifiCode: null,
      documentationStatus: "sufficient",
      eligibilityPercentage: 1,
      eligibleItc: 0,
      requiresReview: true,
    },
  },
  {
    name: "commercial-use-itc-rounding",
    input: {
      vendor: "Staples",
      description: "Office supplies",
      total: 80,
      taxAmount: 10.05,
      gstHstNumber: "123456789RT0001",
      commercialUsePercentage: 50,
    },
    expected: {
      classification: "Office Expenses",
      gifiCode: "8810",
      documentationStatus: "sufficient",
      eligibilityPercentage: 0.5,
      eligibleItc: 5.03,
      requiresReview: false,
    },
  },
];

const generatedCases: ReceiptEvaluationCase[] = Array.from(
  { length: 38 },
  (_, index) => {
    const taxAmount = 12 + (index % 5) * 2;
    const commercialUsePercentage = [0, 25, 50, 75, 100][index % 5];

    return {
      name: `generated-office-${index + 1}`,
      input: {
        vendor: "Staples",
        description: `Office supply ${index + 1}`,
        total: 40 + index * 6,
        taxAmount,
        gstHstNumber: index % 3 === 0 ? "123456789RT0001" : "123456789RT0001",
        commercialUsePercentage,
      },
      expected: {
        classification: "Office Expenses",
        gifiCode: "8810",
        documentationStatus: index * 6 < 30 ? "sufficient" : "sufficient",
        eligibilityPercentage: Number(
          (commercialUsePercentage / 100).toFixed(2),
        ),
        eligibleItc: roundMoney(taxAmount * (commercialUsePercentage / 100)),
        requiresReview: false,
      },
    };
  },
);

export const dataset = [...evaluationCases, ...generatedCases];
