/*
 * Loopnow CPA
 * Receipt Processing & GST/HST Bookkeeping
 *
 * Copyright (c) 2026 Arnava Kumar Sinha. All rights reserved.
 */

import { describe, expect, it } from "vitest";
import { validateGstHstNumber } from "../../src/server/domain/cra/gst-hst-rules";

describe("validateGstHstNumber", () => {
  it("returns missing when GST/HST number is absent", () => {
    const result = validateGstHstNumber(null);

    expect(result.status).toBe("missing");
    expect(result.normalizedNumber).toBeNull();
    expect(result.externallyVerified).toBe(false);
  });

  it("returns missing for an empty string", () => {
    const result = validateGstHstNumber("   ");

    expect(result.status).toBe("missing");
    expect(result.normalizedNumber).toBeNull();
  });

  it("rejects a malformed GST/HST number", () => {
    const result = validateGstHstNumber("123456789");

    expect(result.status).toBe("invalid_format");
    expect(result.externallyVerified).toBe(false);
  });

  it("classifies partially shaped GST/HST strings as malformed", () => {
    const result = validateGstHstNumber("123456789XX0001");

    expect(result.status).toBe("malformed");
    expect(result.externallyVerified).toBe(false);
  });

  it("flags obviously suspicious GST/HST values for review", () => {
    const result = validateGstHstNumber("000000000RT0000");

    expect(result.status).toBe("suspicious");
    expect(result.externallyVerified).toBe(false);
  });

  it("reports unavailable registration status explicitly", () => {
    const result = validateGstHstNumber("unavailable");

    expect(result.status).toBe("unavailable");
    expect(result.externallyVerified).toBe(false);
  });

  it("accepts a valid GST/HST format", () => {
    const result = validateGstHstNumber("123456789RT0001");

    expect(result.status).toBe("valid_format");
    expect(result.normalizedNumber).toBe("123456789RT0001");
    expect(result.externallyVerified).toBe(false);
  });

  it("normalizes spaces and lowercase characters", () => {
    const result = validateGstHstNumber("123456789 rt 0001");

    expect(result.status).toBe("valid_format");
    expect(result.normalizedNumber).toBe("123456789RT0001");
  });

  it("does not claim external CRA registration verification", () => {
    const result = validateGstHstNumber("123456789RT0001");

    expect(result.externallyVerified).toBe(false);
    expect(result.reason).toContain("External CRA registration verification");
  });
});
