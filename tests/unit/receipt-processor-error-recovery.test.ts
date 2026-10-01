/*
 * Loopnow CPA
 * Receipt Processing & GST/HST Bookkeeping
 *
 * Copyright (c) 2026 Arnava Kumar Sinha. All rights reserved.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, runReceiptAgentMock, failAgentRunMock } = vi.hoisted(
  () => ({
    prismaMock: {
      $transaction: vi.fn(),
      receipt: { update: vi.fn() },
      auditEvent: { create: vi.fn() },
    },
    runReceiptAgentMock: vi.fn(),
    failAgentRunMock: vi.fn(),
  }),
);

vi.mock("@/server/db", () => ({ prisma: prismaMock }));
vi.mock("@/server/agent/receipt-agent", () => ({
  runReceiptAgent: runReceiptAgentMock,
}));
vi.mock("@/server/agent/agent-run", () => ({
  createAgentRun: vi.fn().mockResolvedValue({ id: "run-error-recovery" }),
  completeAgentRun: vi.fn(),
  failAgentRun: failAgentRunMock,
}));

import { processReceipt } from "@/server/processing/receipt.processor";

describe("receipt processor error recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.auditEvent.create.mockResolvedValue({});
    prismaMock.receipt.update.mockResolvedValue({});
    runReceiptAgentMock.mockRejectedValue(new Error("forced tool failure"));
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback({
        receipt: {
          findUnique: vi.fn().mockResolvedValue({
            id: "receipt-error-recovery",
            status: "PENDING",
          }),
          update: vi.fn().mockResolvedValue({
            id: "receipt-error-recovery",
            status: "PROCESSING",
          }),
        },
      }),
    );
  });

  it("persists FAILED AgentRun, ERROR receipt, and failure audit", async () => {
    await expect(processReceipt("receipt-error-recovery")).rejects.toThrow(
      "forced tool failure",
    );

    expect(failAgentRunMock).toHaveBeenCalledWith(
      "run-error-recovery",
      "forced tool failure",
    );
    expect(prismaMock.receipt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "ERROR" } }),
    );
    expect(prismaMock.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "PROCESSING_FAILED",
          status: "FAILURE",
          ruleVersion: "CRA-PROTOTYPE-v1",
          model: "deterministic-receipt-workflow-v1",
        }),
      }),
    );
  });
});
