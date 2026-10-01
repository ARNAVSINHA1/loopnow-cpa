/*
 * Loopnow CPA
 * Receipt Processing & GST/HST Bookkeeping
 *
 * Copyright (c) 2026 Arnava Kumar Sinha. All rights reserved.
 */

import { describe, expect, it } from "vitest";
import {
  CalculateEligibleItcInputSchema,
  GetReceiptDetailsInputSchema,
  ValidateGstHstNumberFormatInputSchema,
} from "@/server/tools/contracts";
import { createReceiptSchema } from "@/server/receipts/receipt.schema";

describe("tool contracts", () => {
  it("accepts valid receipt details input", () => {
    const result = GetReceiptDetailsInputSchema.safeParse({
      receiptId: "receipt-001",
    });

    expect(result.success).toBe(true);
  });

  it("rejects missing receipt id", () => {
    const result = GetReceiptDetailsInputSchema.safeParse({});

    expect(result.success).toBe(false);
  });

  it("accepts valid ITC calculation input", () => {
    const result = CalculateEligibleItcInputSchema.safeParse({
      receiptId: "receipt-001",
      taxAmount: 12,
      eligibilityPercentage: 0.5,
      documentationStatus: "sufficient",
    });

    expect(result.success).toBe(true);
  });

  it("rejects an ITC percentage outside 0 to 1", () => {
    const result = CalculateEligibleItcInputSchema.safeParse({
      receiptId: "receipt-001",
      taxAmount: 12,
      eligibilityPercentage: 1.5,
      documentationStatus: "sufficient",
    });

    expect(result.success).toBe(false);
  });

  it("accepts nullable GST/HST number", () => {
    const result = ValidateGstHstNumberFormatInputSchema.safeParse({
      receiptId: "receipt-001",
      gstHstNumber: null,
    });

    expect(result.success).toBe(true);
  });

  it("rejects client-supplied classification at receipt creation", () => {
    const result = createReceiptSchema.safeParse({
      vendor: "Staples",
      subtotal: 100,
      taxAmount: 5,
      total: 105,
      category: "Arbitrary category",
    });

    expect(result.success).toBe(false);
  });
});
