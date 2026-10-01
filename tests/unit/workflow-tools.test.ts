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
      commercialUsePercentage: 100,
      grossTax: 0,
      eligibilityPercentage: 0,
      eligibleItc: 0,
      itcStatus: "REVIEW",
      classificationStatus: "REVIEW_REQUIRED",
      confidence: 0,
      reason: "Classification could not be determined.",
    });

    expect(result.status).toBe("FAILURE");
    expect(result.reason).toBe("Receipt not found.");
  });

  it("returns failure for a missing receipt when requesting review", async () => {
    const result = await requestHumanReview({
      receiptId: "non-existent-receipt",
      agentRunId: "test-agent-run",
      proposedCategory: "Unknown",
      proposedGifiCode: "9999",
      proposedItc: 0,
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
    expect(result.agentRunStatus).toBeNull();
    expect(result.currentStep).toBeNull();
    expect(result.currentTool).toBeNull();
    expect(result.iteration).toBeNull();
    expect(result.latestTool).toBeNull();
    expect(result.latestToolStatus).toBeNull();
    expect(result.pendingApproval).toBe(false);
  });
});
