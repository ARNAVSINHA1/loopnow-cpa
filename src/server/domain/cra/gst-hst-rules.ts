/*
 * Loopnow CPA
 * Receipt Processing & GST/HST Bookkeeping
 *
 * Copyright (c) 2026 Arnava Kumar Sinha. All rights reserved.
 */

import { z } from "zod";

export const GstHstValidationStatusSchema = z.enum([
  "missing",
  "invalid_format",
  "malformed",
  "suspicious",
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

  if (
    normalized === "UNAVAILABLE" ||
    normalized === "N/A" ||
    normalized === "UNKNOWN"
  ) {
    return {
      status: "unavailable",
      normalizedNumber: null,
      reason: "GST/HST registration status is unavailable for verification.",
      externallyVerified: false,
    };
  }

  // Canadian GST/HST registration number:
  // 9 digits + RT + 4 digits.
  const format = /^\d{9}RT\d{4}$/;

  if (format.test(normalized)) {
    const prefix = normalized.slice(0, 9);
    const suffix = normalized.slice(11);

    if (
      prefix === "000000000" ||
      suffix === "0000" ||
      /^0+$/.test(prefix) ||
      /^0+$/.test(suffix)
    ) {
      return {
        status: "suspicious",
        normalizedNumber: normalized,
        reason:
          "GST/HST number matches the expected structure but looks suspicious and should be reviewed.",
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

  if (/^[A-Z0-9]+$/.test(normalized) && normalized.length >= 10) {
    return {
      status: "malformed",
      normalizedNumber: normalized,
      reason:
        "GST/HST registration number is structured like a GST/HST identifier but does not follow the expected Canadian format.",
      externallyVerified: false,
    };
  }

  return {
    status: "invalid_format",
    normalizedNumber: normalized,
    reason:
      "GST/HST registration number does not match the expected Canadian registration-number format.",
    externallyVerified: false,
  };
}
