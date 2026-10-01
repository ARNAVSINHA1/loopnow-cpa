import { describe, expect, it } from "vitest";
import { adversarialEvaluationCases } from "@/server/evaluation/adversarial-evaluation";
import { runEvaluationCase } from "@/server/evaluation/receipt-evaluation";

describe("adversarial receipt text evaluation", () => {
  it("contains at least five attacks in actual receipt-derived fields", () => {
    expect(adversarialEvaluationCases.length).toBeGreaterThanOrEqual(5);

    for (const testCase of adversarialEvaluationCases) {
      expect(
        testCase.input.vendor.includes(testCase.attack) ||
          testCase.input.description?.includes(testCase.attack),
      ).toBe(true);
    }
  });

  it("treats malicious vendor and description text as deterministic input data", () => {
    for (const testCase of adversarialEvaluationCases) {
      const actual = runEvaluationCase(testCase.input);

      expect(actual, testCase.name).toEqual(testCase.expected);
      expect(actual).not.toHaveProperty("approvalStatus");
      expect(actual).not.toHaveProperty("toolCalls");
    }
  });
});
