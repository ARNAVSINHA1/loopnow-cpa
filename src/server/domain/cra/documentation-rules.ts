/*
 * Loopnow CPA
 * Receipt Processing & GST/HST Bookkeeping
 *
 * Copyright (c) 2026 Arnava Kumar Sinha. All rights reserved.
 */

import {
  validateGstHstNumber,
  type GstHstValidationResult,
} from "./gst-hst-rules";

export type DocumentationTier = 1 | 2 | 3;

export type DocumentationResult = {
  tier: DocumentationTier;
  status: "sufficient" | "insufficient" | "review";
  reason: string;
  gstHstValidation: GstHstValidationResult;
};

export function getDocumentationTier(total: number): DocumentationTier {
  if (total < 30) return 1;
  if (total < 150) return 2;
  return 3;
}

export function evaluateDocumentation(input: {
  total: number;
  gstHstNumber?: string | null;
}): DocumentationResult {
  const tier = getDocumentationTier(input.total);

  const gstHstValidation = validateGstHstNumber(input.gstHstNumber);

  /*
   * Tier 1:
   * Less extensive documentation requirements apply.
   * Evidence must still permit determination of the ITC amount.
   */
  if (tier === 1) {
    return {
      tier,
      status: "sufficient",
      reason:
        "Tier 1 documentation requirements apply based on transaction amount.",
      gstHstValidation,
    };
  }

  /*
   * Tier 2 and Tier 3:
   * The available GST/HST registration information must at least
   * have a valid format before treating the documentation as sufficient.
   */
  if (gstHstValidation.status === "missing") {
    return {
      tier,
      status: "insufficient",
      reason:
        "Required GST/HST registration number is missing from the available receipt information.",
      gstHstValidation,
    };
  }

  if (
    gstHstValidation.status === "invalid_format" ||
    gstHstValidation.status === "malformed" ||
    gstHstValidation.status === "suspicious"
  ) {
    return {
      tier,
      status: "insufficient",
      reason:
        "The GST/HST registration number is present but does not meet the expected Canadian format or appears suspicious.",
      gstHstValidation,
    };
  }

  if (gstHstValidation.status === "unavailable") {
    return {
      tier,
      status: "review",
      reason:
        "GST/HST registration status is unavailable and requires human review.",
      gstHstValidation,
    };
  }

  return {
    tier,
    status: "sufficient",
    reason:
      "Required GST/HST registration information is present and matches the expected format. External CRA registration verification has not been performed.",
    gstHstValidation,
  };
}
