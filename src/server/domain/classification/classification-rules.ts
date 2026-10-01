/*
 * Loopnow CPA
 * Receipt Processing & GST/HST Bookkeeping
 *
 * Copyright (c) 2026 Arnava Kumar Sinha. All rights reserved.
 */

import {
  isMealITCException,
  type MealITCException,
} from "@/server/domain/cra/meals-rules";

export type ClassificationResult = {
  category: string;
  gifiCode: string | null;
  confidence: number;
  reason: string;
  mealException?: MealITCException | null;
  mealExceptionRequiresReview?: boolean;
};

export function classifyExpense(input: {
  vendor: string;
  description?: string | null;
  mealExceptionProposal?: string | null;
}): ClassificationResult {
  const text = `${input.vendor} ${input.description ?? ""}`.toLowerCase();

  if (/\bcash\s+deposit\b/.test(text)) {
    return {
      category: "Unknown",
      gifiCode: null,
      confidence: 0,
      reason:
        "Cash deposits do not provide enough itemization for deterministic classification.",
      mealExceptionRequiresReview: input.mealExceptionProposal !== undefined,
    };
  }

  if (
    text.includes("meal") ||
    text.includes("restaurant") ||
    text.includes("dining") ||
    text.includes("keg")
  ) {
    const proposal = input.mealExceptionProposal;
    const mealException =
      proposal === undefined || proposal === null
        ? "standard"
        : isMealITCException(proposal)
          ? proposal
          : null;

    return {
      category: "Meals and Entertainment",
      gifiCode: "8523",
      confidence: 0.9,
      reason:
        "Receipt vendor/description matches the prototype business-meal classification rules.",
      mealException,
      mealExceptionRequiresReview:
        mealException === null || mealException !== "standard",
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
      mealExceptionRequiresReview: input.mealExceptionProposal != null,
    };
  }

  return {
    category: "Unknown",
    gifiCode: null,
    confidence: 0,
    reason:
      "No deterministic classification rule matched the available receipt information.",
    mealExceptionRequiresReview: input.mealExceptionProposal !== undefined,
  };
}
