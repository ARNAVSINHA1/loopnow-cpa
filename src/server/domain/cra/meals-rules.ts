export const MealITCPolicy = {
  standard: 0.5,
  charityOrPublicInstitution: 1.0,
  longHaulTruckDriver: 0.8,
} as const;

export type MealITCException =
  | "standard"
  | "charityOrPublicInstitution"
  | "longHaulTruckDriver";

export function getMealITCPercentage(
  exception: MealITCException = "standard",
): number {
  return MealITCPolicy[exception];
}

export function applyMealITCLimitation(
  commercialUsePercentage: number,
  exception: MealITCException = "standard",
): number {
  const commercialUse = Math.max(
    0,
    Math.min(1, commercialUsePercentage),
  );

  return commercialUse * getMealITCPercentage(exception);
}