import { z } from "zod";

export const GstHstValidationStatusSchema = z.enum([
  "missing",
  "invalid_format",
  "valid_format",
  "unavailable",
]);

export type GstHstValidationStatus = z.infer<
  typeof GstHstValidationStatusSchema
>;

export type GstHstValidationResult = {
  status: GstHstValidationStatus;
  normalizedNumber: string | null;
  reason: string;
  externallyVerified: false;
};

/**
 * Validates the structure of a Canadian GST/HST registration number.
 *
 * This performs FORMAT validation only.
 * A syntactically valid number does not prove that the registration
 * is actually registered with CRA.
 */
export function validateGstHstNumber(
  value: string | null | undefined,
): GstHstValidationResult {
  if (!value || value.trim().length === 0) {
    return {
      status: "missing",
      normalizedNumber: null,
      reason: "GST/HST registration number is missing.",
      externallyVerified: false,
    };
  }

  const normalized = value.trim().toUpperCase().replace(/\s+/g, "");

  // Canadian GST/HST registration number:
  // 9 digits + RT + 4 digits.
  const format = /^\d{9}RT\d{4}$/;

  if (!format.test(normalized)) {
    return {
      status: "invalid_format",
      normalizedNumber: normalized,
      reason:
        "GST/HST registration number does not match the expected Canadian registration-number format.",
      externallyVerified: false,
    };
  }

  return {
    status: "valid_format",
    normalizedNumber: normalized,
    reason:
      "GST/HST registration number matches the expected Canadian format. External CRA registration verification has not been performed.",
    externallyVerified: false,
  };
}
