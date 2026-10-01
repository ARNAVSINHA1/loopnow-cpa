/*
 * Loopnow CPA
 * Receipt Processing & GST/HST Bookkeeping
 *
 * Copyright (c) 2026 Arnava Kumar Sinha. All rights reserved.
 */

import { z } from "zod";

export const MealITCExceptionSchema = z.enum([
  "standard",
  "charityOrPublicInstitution",
  "longHaulTruckDriver",
]);

export const MealITCPolicy = {
  standard: 0.5,
  charityOrPublicInstitution: 1.0,
  longHaulTruckDriver: 0.8,
} as const;

export type MealITCException =
  "standard" | "charityOrPublicInstitution" | "longHaulTruckDriver";

export function isMealITCException(value: unknown): value is MealITCException {
  return MealITCExceptionSchema.safeParse(value).success;
}

export function getMealITCPercentage(
  exception: MealITCException = "standard",
): number {
  return MealITCPolicy[exception];
}

export function applyMealITCLimitation(
  commercialUsePercentage: number,
  exception: MealITCException = "standard",
): number {
  const commercialUse = Math.max(0, Math.min(1, commercialUsePercentage));

  return commercialUse * getMealITCPercentage(exception);
}
