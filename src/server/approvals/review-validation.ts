import { findGifiCode } from "@/server/domain/gifi/gifi-rules";
import {
  applyMealITCLimitation,
  isMealITCException,
  type MealITCException,
} from "@/server/domain/cra/meals-rules";

export const ALLOWED_EXPENSE_CATEGORIES = [
  "Office Expenses",
  "Meals and Entertainment",
  "Unknown",
] as const;

export type ApprovedExpenseCategory =
  (typeof ALLOWED_EXPENSE_CATEGORIES)[number];

export function normalizeExpenseCategory(value: string | null | undefined) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  const exact = ALLOWED_EXPENSE_CATEGORIES.find(
    (candidate) => candidate.toLowerCase() === trimmed.toLowerCase(),
  );

  return exact ?? null;
}

export function validateControlledGifi(
  category: string | null | undefined,
  gifiCode: string | null | undefined,
) {
  const normalizedCategory = normalizeExpenseCategory(category);

  if (!gifiCode) {
    return null;
  }

  const trimmedGifi = gifiCode.trim();
  const candidate = findGifiCode(trimmedGifi);

  if (!candidate) {
    throw new Error(
      `GIFI code ${trimmedGifi} is not in the controlled catalogue.`,
    );
  }

  if (
    normalizedCategory &&
    candidate.category.trim().toLowerCase() !==
      normalizedCategory.trim().toLowerCase()
  ) {
    throw new Error(
      `GIFI code ${trimmedGifi} does not match the category ${normalizedCategory}.`,
    );
  }

  return candidate.code;
}

export function calculateDeterministicItcLimit(
  taxAmount: number,
  commercialUsePercentage: number | null | undefined,
  category: string | null | undefined,
  mealException?: string | null,
): number {
  const safeTax = Number.isFinite(taxAmount) ? Math.max(0, taxAmount) : 0;

  const safeCommercialUse = Number.isFinite(Number(commercialUsePercentage))
    ? Math.max(0, Math.min(100, Number(commercialUsePercentage)))
    : 100;

  const normalizedCategory = normalizeExpenseCategory(category);

  if (!normalizedCategory || normalizedCategory === "Unknown") {
    return 0;
  }

  if (normalizedCategory === "Office Expenses") {
    return roundCurrency(safeTax * (safeCommercialUse / 100));
  }

  if (normalizedCategory === "Meals and Entertainment") {
    const exception = mealException ?? "standard";

    if (!isMealITCException(exception)) {
      return 0;
    }

    return roundCurrency(
      safeTax * applyMealITCLimitation(safeCommercialUse / 100, exception),
    );
  }

  return 0;
}

export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateDeterministicEligibilityPercentage(
  commercialUsePercentage: number,
  category: string | null | undefined,
  mealException?: MealITCException | null,
): number {
  const normalizedCategory = normalizeExpenseCategory(category);
  const safeCommercialUse = Math.max(0, Math.min(100, commercialUsePercentage));

  if (normalizedCategory === "Office Expenses") {
    return safeCommercialUse / 100;
  }

  if (normalizedCategory === "Meals and Entertainment") {
    if (
      mealException !== undefined &&
      mealException !== null &&
      !isMealITCException(mealException)
    ) {
      return 0;
    }

    return applyMealITCLimitation(
      safeCommercialUse / 100,
      mealException ?? "standard",
    );
  }

  return 0;
}
