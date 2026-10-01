import { describe, expect, it } from "vitest";
import {
  getMealITCPercentage,
  applyMealITCLimitation,
} from "../../src/server/domain/cra/meals-rules";
import { calculateDeterministicItcLimit } from "@/server/approvals/review-validation";

describe("Meal ITC rules", () => {
  it("applies the standard 50% limitation", () => {
    expect(getMealITCPercentage("standard")).toBe(0.5);
  });

  it("applies 100% for charity/public institution", () => {
    expect(getMealITCPercentage("charityOrPublicInstitution")).toBe(1);
  });

  it("applies 80% for long-haul truck driver", () => {
    expect(getMealITCPercentage("longHaulTruckDriver")).toBe(0.8);
  });

  it("calculates standard meal eligibility at 50% commercial use", () => {
    expect(applyMealITCLimitation(1, "standard")).toBe(0.5);
  });

  it("calculates partial commercial use correctly", () => {
    expect(applyMealITCLimitation(0.8, "standard")).toBe(0.4);
  });

  it("calculates 100% eligibility for charity/public institution", () => {
    expect(applyMealITCLimitation(1, "charityOrPublicInstitution")).toBe(1);
  });

  it("calculates 80% eligibility for long-haul truck driver", () => {
    expect(applyMealITCLimitation(1, "longHaulTruckDriver")).toBe(0.8);
  });

  it("calculates $12 meal tax as $6, $12, and $9.60 by supported policy", () => {
    expect(
      calculateDeterministicItcLimit(
        12,
        100,
        "Meals and Entertainment",
        "standard",
      ),
    ).toBe(6);
    expect(
      calculateDeterministicItcLimit(
        12,
        100,
        "Meals and Entertainment",
        "charityOrPublicInstitution",
      ),
    ).toBe(12);
    expect(
      calculateDeterministicItcLimit(
        12,
        100,
        "Meals and Entertainment",
        "longHaulTruckDriver",
      ),
    ).toBe(9.6);
  });

  it("combines commercial use with each supported meal policy", () => {
    expect(
      calculateDeterministicItcLimit(
        12,
        50,
        "Meals and Entertainment",
        "standard",
      ),
    ).toBe(3);
    expect(
      calculateDeterministicItcLimit(
        12,
        50,
        "Meals and Entertainment",
        "charityOrPublicInstitution",
      ),
    ).toBe(6);
    expect(
      calculateDeterministicItcLimit(
        12,
        50,
        "Meals and Entertainment",
        "longHaulTruckDriver",
      ),
    ).toBe(4.8);
  });

  it("returns zero for an unsupported exception proposal", () => {
    expect(
      calculateDeterministicItcLimit(
        12,
        100,
        "Meals and Entertainment",
        "claimEverything",
      ),
    ).toBe(0);
  });

  it("clamps commercial use below zero", () => {
    expect(applyMealITCLimitation(-0.5, "standard")).toBe(0);
  });

  it("clamps commercial use above 100%", () => {
    expect(applyMealITCLimitation(1.5, "standard")).toBe(0.5);
  });
});
