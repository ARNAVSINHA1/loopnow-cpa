import { describe, expect, it } from "vitest";
import {
  getProcessingStatus,
  requestHumanReview,
  updateExpenseClassification,
} from "@/server/tools";

describe("workflow tools", () => {
  it("requires review when classification has no GIFI", async () => {
    const result = await updateExpenseClassification({
      receiptId: "non-existent-receipt",
      category: "Unknown",
      gifiCode: null,
      confidence: 0,
      reason: "Classification could not be determined.",
    });

    expect(result.status).toBe("FAILURE");
    expect(result.reason).toBe("Receipt not found.");
  });

  it("returns failure for a missing receipt when requesting review", async () => {
    const result = await requestHumanReview({
      receiptId: "non-existent-receipt",
      proposedCategory: "Office Expenses",
      proposedGifiCode: "8810",
      proposedItc: 10,
      reason: "Manual verification required.",
    });

    expect(result.status).toBe("FAILURE");
    expect(result.approvalId).toBeNull();
  });

  it("returns failure for a missing receipt when checking status", async () => {
    const result = await getProcessingStatus({
      receiptId: "non-existent-receipt",
    });

    expect(result.status).toBe("FAILURE");
    expect(result.receiptStatus).toBeNull();
    expect(result.pendingApproval).toBe(false);
  });
});
