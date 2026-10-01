import { describe, expect, it, vi } from "vitest";
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

  it("reads the persisted completed AgentRun state and the latest completed tool", async () => {
    const toolCallFindMany = vi.fn().mockImplementation(async ({ orderBy }) => {
      expect(orderBy).toEqual([{ completedAt: "desc" }, { startedAt: "desc" }]);

      return [
        {
          toolName: "update_expense_classification",
          status: "SUCCESS",
          startedAt: new Date("2024-01-01T00:00:01.000Z"),
          completedAt: new Date("2024-01-01T00:00:02.000Z"),
        },
      ];
    });

    const result = await getProcessingStatus(
      { receiptId: "receipt-completed" },
      {
        receipt: {
          findUnique: async () => ({
            id: "receipt-completed",
            status: "REVIEW_REQUIRED",
          }),
        },
        agentRun: {
          findFirst: async () => ({
            id: "run-1",
            status: "COMPLETED",
            currentStep: "COMPLETED",
            currentTool: null,
            iteration: 4,
          }),
        },
        toolCall: {
          findMany: toolCallFindMany,
        },
        approval: {
          findFirst: async () => ({
            id: "approval-1",
            status: "PENDING",
          }),
        },
      } as any,
    );

    expect(result.status).toBe("SUCCESS");
    expect(result.agentRunStatus).toBe("COMPLETED");
    expect(result.currentStep).toBe("COMPLETED");
    expect(result.currentTool).toBeNull();
    expect(result.iteration).toBe(4);
    expect(result.latestTool).toBe("update_expense_classification");
    expect(result.latestToolStatus).toBe("SUCCESS");
    expect(result.pendingApproval).toBe(true);
  });
});
