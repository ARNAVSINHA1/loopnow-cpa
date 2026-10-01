import { describe, expect, it } from "vitest";
import {
  getMealITCPercentage,
  applyMealITCLimitation,
} from "../../src/server/domain/cra/meals-rules";

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
    expect(
      applyMealITCLimitation(1, "charityOrPublicInstitution"),
    ).toBe(1);
  });

  it("calculates 80% eligibility for long-haul truck driver", () => {
    expect(
      applyMealITCLimitation(1, "longHaulTruckDriver"),
    ).toBe(0.8);
  });

  it("clamps commercial use below zero", () => {
    expect(applyMealITCLimitation(-0.5, "standard")).toBe(0);
  });

  it("clamps commercial use above 100%", () => {
    expect(applyMealITCLimitation(1.5, "standard")).toBe(0.5);
  });
});