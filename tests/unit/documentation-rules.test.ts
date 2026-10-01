/*
 * Loopnow CPA
 * Receipt Processing & GST/HST Bookkeeping
 *
 * Copyright (c) 2026 Arnava Kumar Sinha. All rights reserved.
 */

import { describe, expect, it } from "vitest";
import {
  evaluateDocumentation,
  getDocumentationTier,
} from "../../src/server/domain/cra/documentation-rules";

describe("getDocumentationTier", () => {
  it("uses Tier 1 below $30", () => {
    expect(getDocumentationTier(29.99)).toBe(1);
  });

  it("uses Tier 2 at exactly $30", () => {
    expect(getDocumentationTier(30)).toBe(2);
  });

  it("uses Tier 2 above $30", () => {
    expect(getDocumentationTier(30.01)).toBe(2);
  });

  it("uses Tier 2 below $150", () => {
    expect(getDocumentationTier(149.99)).toBe(2);
  });

  it("uses Tier 3 at exactly $150", () => {
    expect(getDocumentationTier(150)).toBe(3);
  });

  it("uses Tier 3 above $150", () => {
    expect(getDocumentationTier(150.01)).toBe(3);
  });
});

describe("evaluateDocumentation", () => {
  it("treats Tier 1 documentation as sufficient", () => {
    const result = evaluateDocumentation({
      total: 29.99,
    });

    expect(result.tier).toBe(1);
    expect(result.status).toBe("sufficient");
    expect(result.gstHstValidation.status).toBe("missing");
  });

  it("marks Tier 2 missing GST/HST number as insufficient", () => {
    const result = evaluateDocumentation({
      total: 100,
    });

    expect(result.tier).toBe(2);
    expect(result.status).toBe("insufficient");
    expect(result.gstHstValidation.status).toBe("missing");
  });

  it("marks Tier 3 missing GST/HST number as insufficient", () => {
    const result = evaluateDocumentation({
      total: 150,
    });

    expect(result.tier).toBe(3);
    expect(result.status).toBe("insufficient");
    expect(result.gstHstValidation.status).toBe("missing");
  });

  it("marks malformed GST/HST number as insufficient", () => {
    const result = evaluateDocumentation({
      total: 100,
      gstHstNumber: "123456789",
    });

    expect(result.tier).toBe(2);
    expect(result.status).toBe("insufficient");
    expect(result.gstHstValidation.status).toBe("invalid_format");
  });

  it("accepts a valid-format GST/HST number", () => {
    const result = evaluateDocumentation({
      total: 100,
      gstHstNumber: "123456789RT0001",
    });

    expect(result.tier).toBe(2);
    expect(result.status).toBe("sufficient");
    expect(result.gstHstValidation.status).toBe("valid_format");
  });

  it("accepts a valid-format GST/HST number for Tier 3", () => {
    const result = evaluateDocumentation({
      total: 150,
      gstHstNumber: "123456789RT0001",
    });

    expect(result.tier).toBe(3);
    expect(result.status).toBe("sufficient");
    expect(result.gstHstValidation.status).toBe("valid_format");
  });
});
