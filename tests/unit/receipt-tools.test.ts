import { describe, expect, it } from "vitest";
import { ReceiptToolResultSchema } from "@/server/tools/contracts";

describe("receipt tool result contracts", () => {
  it("accepts a successful receipt result", () => {
    const result = ReceiptToolResultSchema.safeParse({
      status: "SUCCESS",
      receiptId: "receipt-001",
      receipt: {
        id: "receipt-001",
        vendor: "Staples",
        receiptDate: "2026-09-20T00:00:00.000Z",
        description: "Office supplies",
        subtotal: 100,
        taxAmount: 13,
        total: 113,
        taxType: "HST",
        gstHstNumber: "123456789RT0001",
        commercialUsePercentage: 100,
        category: "Office Expenses",
        receiptAvailable: true,
        status: "COMPLETED",
      },
    });

    expect(result.success).toBe(true);
  });

  it("accepts a review-required result with no selected receipt", () => {
    const result = ReceiptToolResultSchema.safeParse({
      status: "REVIEW_REQUIRED",
      receiptId: null,
      message: "No receipt is currently selected.",
    });

    expect(result.success).toBe(true);
  });

  it("rejects an invalid receipt result", () => {
    const result = ReceiptToolResultSchema.safeParse({
      status: "SUCCESS",
      receiptId: "receipt-001",
      receipt: {
        id: "receipt-001",
        vendor: "Staples",
        subtotal: "100",
      },
    });

    expect(result.success).toBe(false);
  });
});
