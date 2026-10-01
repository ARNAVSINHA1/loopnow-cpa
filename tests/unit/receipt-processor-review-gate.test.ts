import { describe, expect, it, vi } from "vitest";

const { prismaMock, runReceiptAgentMock } = vi.hoisted(() => ({
  prismaMock: { $transaction: vi.fn() },
  runReceiptAgentMock: vi.fn(),
}));

vi.mock("@/server/db", () => ({ prisma: prismaMock }));
vi.mock("@/server/agent/receipt-agent", () => ({
  runReceiptAgent: runReceiptAgentMock,
}));

import { processReceipt } from "@/server/processing/receipt.processor";

describe("receipt processor review gate", () => {
  it("does not restart a rejected review receipt without a pending approval", async () => {
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback({
        receipt: {
          findUnique: vi.fn().mockResolvedValue({
            id: "receipt-rejected",
            status: "REVIEW_REQUIRED",
          }),
        },
        approval: { findFirst: vi.fn().mockResolvedValue(null) },
      }),
    );

    const result = await processReceipt("receipt-rejected");

    expect(result.status).toBe("REVIEW_REQUIRED");
    expect(runReceiptAgentMock).not.toHaveBeenCalled();
  });
});
