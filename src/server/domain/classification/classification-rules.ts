import type { MealITCException } from "@/server/domain/cra/meals-rules";

export type ClassificationResult = {
  category: string;
  gifiCode: string | null;
  confidence: number;
  reason: string;
  mealException?: MealITCException;
};

export function classifyExpense(input: {
  vendor: string;
  description?: string | null;
}): ClassificationResult {
  const text = `${input.vendor} ${input.description ?? ""}`.toLowerCase();

  if (
    text.includes("meal") ||
    text.includes("restaurant") ||
    text.includes("dining") ||
    text.includes("keg")
  ) {
    return {
      category: "Meals and Entertainment",
      gifiCode: "8523",
      confidence: 0.9,
      reason:
        "Receipt vendor/description matches the prototype business-meal classification rules.",
      mealException: "standard",
    };
  }

  if (
    text.includes("staples") ||
    text.includes("office") ||
    text.includes("best buy")
  ) {
    return {
      category: "Office Expenses",
      gifiCode: "8810",
      confidence: 0.9,
      reason:
        "Receipt vendor/description matches the prototype office-expense classification rules.",
    };
  }

  return {
    category: "Unknown",
    gifiCode: null,
    confidence: 0,
    reason:
      "No deterministic classification rule matched the available receipt information.",
  };
}
