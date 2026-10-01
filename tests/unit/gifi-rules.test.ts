import { describe, expect, it } from "vitest";
import {
  findGifiCode,
  findGifiForCategory,
} from "../../src/server/domain/gifi/gifi-rules";

describe("GIFI rules", () => {
  it("finds Office Expenses by GIFI code", () => {
    const result = findGifiCode("8810");

    expect(result).not.toBeNull();
    expect(result?.code).toBe("8810");
    expect(result?.category).toBe("Office Expenses");
  });

  it("finds Meals and Entertainment by GIFI code", () => {
    const result = findGifiCode("8523");

    expect(result).not.toBeNull();
    expect(result?.code).toBe("8523");
    expect(result?.category).toBe("Meals and Entertainment");
  });

  it("finds Office Expenses by category", () => {
    const result = findGifiForCategory("Office Expenses");

    expect(result?.code).toBe("8810");
  });

  it("finds Meals and Entertainment by category", () => {
    const result = findGifiForCategory("Meals and Entertainment");

    expect(result?.code).toBe("8523");
  });

  it("returns null for an unknown GIFI code", () => {
    expect(findGifiCode("9999")).toBeNull();
  });

  it("returns null for an unknown category", () => {
    expect(findGifiForCategory("Unknown Expense")).toBeNull();
  });

  it("matches categories case-insensitively", () => {
    const result = findGifiForCategory("meals and entertainment");

    expect(result?.code).toBe("8523");
  });

  it("returns null for a blank category", () => {
    expect(findGifiForCategory("")).toBeNull();
  });
});
