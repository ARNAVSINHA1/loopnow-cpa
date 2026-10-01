import { describe, expect, it } from "vitest";
import { assignGifiCode, classifyExpenseTool } from "@/server/tools";

describe("classification tools", () => {
  describe("classifyExpenseTool", () => {
    it("classifies a business meal", async () => {
      const result = await classifyExpenseTool({
        receiptId: "receipt-001",
        vendor: "The Keg",
        description: "Business dinner",
      });

      expect(result.category).toBe("Meals and Entertainment");
      expect(result.gifiCode).toBe("8523");
      expect(result.confidence).toBe(0.9);
      expect(result.mealException).toBe("standard");
    });

    it("classifies office expenses", async () => {
      const result = await classifyExpenseTool({
        receiptId: "receipt-002",
        vendor: "Staples",
        description: "Printer paper",
      });

      expect(result.category).toBe("Office Expenses");
      expect(result.gifiCode).toBe("8810");
    });

    it("routes unknown expenses without a deterministic match", async () => {
      const result = await classifyExpenseTool({
        receiptId: "receipt-003",
        vendor: "Unknown Vendor",
        description: "Something unclear",
      });

      expect(result.category).toBe("Unknown");
      expect(result.gifiCode).toBeNull();
      expect(result.confidence).toBe(0);
    });

    it("requires review for unsupported structured meal-exception proposals", async () => {
      const result = await classifyExpenseTool({
        receiptId: "receipt-004",
        vendor: "The Keg",
        description: "Business dinner",
        mealExceptionProposal: "claimEverything",
      });

      expect(result.mealException).toBeNull();
      expect(result.mealExceptionRequiresReview).toBe(true);
    });

    it("does not apply a meal exception to an office expense", async () => {
      const result = await classifyExpenseTool({
        receiptId: "receipt-005",
        vendor: "Staples",
        description: "Printer paper",
        mealExceptionProposal: "charityOrPublicInstitution",
      });

      expect(result.category).toBe("Office Expenses");
      expect(result.mealExceptionRequiresReview).toBe(true);
    });
  });

  describe("assignGifiCode", () => {
    it("verifies a valid office GIFI code", async () => {
      const result = await assignGifiCode({
        receiptId: "receipt-001",
        category: "Office Expenses",
        proposedCode: "8810",
      });

      expect(result.status).toBe("SUCCESS");
      expect(result.gifiCode).toBe("8810");
    });

    it("verifies a valid meals GIFI code", async () => {
      const result = await assignGifiCode({
        receiptId: "receipt-002",
        category: "Meals and Entertainment",
        proposedCode: "8523",
      });

      expect(result.status).toBe("SUCCESS");
      expect(result.gifiCode).toBe("8523");
    });

    it("rejects an unknown GIFI code", async () => {
      const result = await assignGifiCode({
        receiptId: "receipt-003",
        category: "Office Expenses",
        proposedCode: "9999",
      });

      expect(result.status).toBe("REVIEW_REQUIRED");
      expect(result.gifiCode).toBeNull();
    });

    it("rejects a GIFI code that does not match the category", async () => {
      const result = await assignGifiCode({
        receiptId: "receipt-004",
        category: "Office Expenses",
        proposedCode: "8523",
      });

      expect(result.status).toBe("REVIEW_REQUIRED");
      expect(result.gifiCode).toBeNull();
    });

    it("resolves GIFI from a known category", async () => {
      const result = await assignGifiCode({
        receiptId: "receipt-005",
        category: "Office Expenses",
        proposedCode: null,
      });

      expect(result.status).toBe("SUCCESS");
      expect(result.gifiCode).toBe("8810");
    });

    it("requires review for an unknown category", async () => {
      const result = await assignGifiCode({
        receiptId: "receipt-006",
        category: "Unknown",
        proposedCode: null,
      });

      expect(result.status).toBe("REVIEW_REQUIRED");
      expect(result.gifiCode).toBeNull();
    });
  });
});
