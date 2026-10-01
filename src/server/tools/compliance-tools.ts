/*
 * Loopnow CPA
 * Receipt Processing & GST/HST Bookkeeping
 *
 * Copyright (c) 2026 Arnava Kumar Sinha. All rights reserved.
 */

import {
  evaluateDocumentation,
  type DocumentationResult,
} from "@/server/domain/cra/documentation-rules";
import {
  validateGstHstNumber,
  type GstHstValidationResult,
} from "@/server/domain/cra/gst-hst-rules";
import {
  calculateEligibleITC,
  CalculateITCInputSchema,
  type CalculateITCInput,
  type ITCResult,
} from "@/server/domain/cra/itc-rules";
import {
  CalculateEligibleItcInputSchema,
  ValidateCraDocumentationInputSchema,
  ValidateGstHstNumberFormatInputSchema,
} from "./contracts";

export async function validateGstHstNumberFormat(
  input: Parameters<typeof ValidateGstHstNumberFormatInputSchema.parse>[0],
): Promise<GstHstValidationResult> {
  const parsed = ValidateGstHstNumberFormatInputSchema.parse(input);

  return validateGstHstNumber(parsed.gstHstNumber);
}

export async function validateCraDocumentation(
  input: Parameters<typeof ValidateCraDocumentationInputSchema.parse>[0],
): Promise<DocumentationResult> {
  const parsed = ValidateCraDocumentationInputSchema.parse(input);

  return evaluateDocumentation({
    total: parsed.total,
    gstHstNumber: parsed.gstHstNumber,
  });
}

export async function calculateEligibleItc(
  input: CalculateITCInput,
): Promise<ITCResult> {
  const parsed = CalculateEligibleItcInputSchema.parse(input);

  return calculateEligibleITC(parsed);
}
