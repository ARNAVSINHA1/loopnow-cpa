/*
 * Loopnow CPA
 * Receipt Processing & GST/HST Bookkeeping
 *
 * Copyright (c) 2026 Arnava Kumar Sinha. All rights reserved.
 */

import { describe, expect, it } from "vitest";
import {
  calculateEligibleItc,
  validateCraDocumentation,
  validateGstHstNumberFormat,
} from "@/server/tools";

describe("compliance tools", () => {
  describe("validateGstHstNumberFormat", () => {
    it("accepts a valid GST/HST registration number", async () => {
      const result = await validateGstHstNumberFormat({
        receiptId: "receipt-001",
        gstHstNumber: "123456789RT0001",
      });

      expect(result.status).toBe("valid_format");
      expect(result.normalizedNumber).toBe("123456789RT0001");
      expect(result.externallyVerified).toBe(false);
    });

    it("detects a missing GST/HST number", async () => {
      const result = await validateGstHstNumberFormat({
        receiptId: "receipt-001",
        gstHstNumber: null,
      });

      expect(result.status).toBe("missing");
      expect(result.normalizedNumber).toBeNull();
    });
  });

  describe("validateCraDocumentation", () => {
    it("marks a tier 1 transaction as sufficient", async () => {
      const result = await validateCraDocumentation({
        receiptId: "receipt-001",
        total: 25,
        gstHstNumber: null,
      });

      expect(result.tier).toBe(1);
      expect(result.status).toBe("sufficient");
    });

    it("requires GST/HST information for a larger transaction", async () => {
      const result = await validateCraDocumentation({
        receiptId: "receipt-001",
        total: 200,
        gstHstNumber: null,
      });

      expect(result.tier).toBe(3);
      expect(result.status).toBe("insufficient");
    });
  });

  describe("calculateEligibleItc", () => {
    it("calculates a partial ITC deterministically", async () => {
      const result = await calculateEligibleItc({
        receiptId: "receipt-001",
        taxAmount: 12,
        eligibilityPercentage: 0.5,
        documentationStatus: "sufficient",
      });

      expect(result.status).toBe("partial");
      expect(result.grossTax).toBe(12);
      expect(result.eligibilityPercentage).toBe(0.5);
      expect(result.eligibleITC).toBe(6);
      expect(result.ruleApplied).toBe("STANDARD_ITC");
      expect(result.source).toBe("CRA_RULE_ENGINE");
    });

    it("routes insufficient documentation to review", async () => {
      const result = await calculateEligibleItc({
        receiptId: "receipt-001",
        taxAmount: 12,
        eligibilityPercentage: 1,
        documentationStatus: "insufficient",
      });

      expect(result.status).toBe("review");
      expect(result.eligibleITC).toBe(0);
      expect(result.ruleApplied).toBe("DOCUMENTATION_REVIEW");
    });
  });
});
