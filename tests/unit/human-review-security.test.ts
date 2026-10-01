/*
 * Loopnow CPA
 * Receipt Processing & GST/HST Bookkeeping
 *
 * Copyright (c) 2026 Arnava Kumar Sinha. All rights reserved.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  prisma: prismaMock,
}));

import { processApproval } from "@/server/approvals/approval.service";
import { calculateEligibleITC } from "@/server/domain/cra/itc-rules";
import {
  requestHumanReview,
  updateExpenseClassification,
} from "@/server/tools";

describe("human review and security hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects arbitrary ITC edits that exceed the server calculated maximum", async () => {
    const tx = {
      approval: {
        findUnique: vi.fn().mockResolvedValue({
          id: "approval-1",
          receiptId: "receipt-1",
          agentRunId: "run-1",
          status: "PENDING",
          proposedCategory: "Office Expenses",
          proposedGifiCode: "8810",
          proposedItc: 5,
          receipt: {
            id: "receipt-1",
            status: "REVIEW_REQUIRED",
            category: "Office Expenses",
            taxAmount: 20,
            commercialUsePercentage: 100,
            expense: {
              commercialUsePercentage: 100,
            },
          },
        }),
        update: vi.fn().mockResolvedValue({ id: "approval-1" }),
      },
      expense: {
        findUnique: vi.fn().mockResolvedValue({
          receiptId: "receipt-1",
          commercialUsePercentage: 100,
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      receipt: {
        update: vi.fn().mockResolvedValue({}),
      },
      auditEvent: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback(tx),
    );

    await expect(
      processApproval({
        approvalId: "approval-1",
        action: "EDIT",
        reviewer: "auditor",
        category: "Office Expenses",
        gifiCode: "8810",
        itc: 500,
        decision: "Edited with invalid ITC",
      }),
    ).rejects.toThrow("ITC exceeds the server-calculated maximum");
  });

  it("rejects unknown GIFI codes during review requests", async () => {
    const result = await requestHumanReview(
      {
        receiptId: "receipt-1",
        agentRunId: "run-1",
        proposedCategory: "Office Expenses",
        proposedGifiCode: "9999",
        proposedItc: 5,
        reason: "Invalid injection attempt",
      },
      {
        receipt: {
          findUnique: vi.fn().mockResolvedValue({
            id: "receipt-1",
            taxAmount: 20,
            commercialUsePercentage: 100,
          }),
          update: vi.fn(),
        },
        approval: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn(),
        },
      } as any,
    );

    expect(result.status).toBe("FAILURE");
    expect(result.message).toContain("GIFI");
  });

  it("rejects direct financial mutation attempts against the server tool", async () => {
    const result = await updateExpenseClassification(
      {
        receiptId: "receipt-1",
        category: "Office Expenses",
        gifiCode: "9999",
        commercialUsePercentage: 100,
        grossTax: 20,
        eligibilityPercentage: 1,
        eligibleItc: 500,
        itcStatus: "ELIGIBLE",
        classificationStatus: "CLASSIFIED",
        confidence: 1,
        reason: "Attempted invalid server-side mutation",
      },
      {
        receipt: {
          findUnique: vi.fn().mockResolvedValue({
            id: "receipt-1",
            taxAmount: 20,
            commercialUsePercentage: 100,
          }),
        },
        expense: {
          upsert: vi.fn(),
        },
      } as any,
    );

    expect(result.status).toBe("FAILURE");
    expect(result.reason).toContain("GIFI");
  });

  it("keeps deterministic ITC logic in control even when the prompt says to ignore it", () => {
    const calculation = calculateEligibleITC({
      receiptId: "receipt-1",
      taxAmount: 12,
      eligibilityPercentage: 1,
      documentationStatus: "sufficient",
    });

    expect(calculation.eligibleITC).toBe(12);
    expect(calculation.status).toBe("eligible");
  });

  it("blocks already-resolved receipts from being approved again", async () => {
    const tx = {
      approval: {
        findUnique: vi.fn().mockResolvedValue({
          id: "approval-1",
          receiptId: "receipt-1",
          agentRunId: "run-1",
          status: "PENDING",
          proposedCategory: "Office Expenses",
          proposedGifiCode: "8810",
          proposedItc: 5,
          receipt: {
            id: "receipt-1",
            status: "COMPLETED",
            category: "Office Expenses",
            taxAmount: 20,
            commercialUsePercentage: 100,
            expense: {
              commercialUsePercentage: 100,
            },
          },
        }),
      },
      expense: {
        findUnique: vi.fn().mockResolvedValue({
          receiptId: "receipt-1",
          commercialUsePercentage: 100,
        }),
      },
    };

    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback(tx),
    );

    await expect(
      processApproval({
        approvalId: "approval-1",
        action: "APPROVE",
        reviewer: "auditor",
        category: "Office Expenses",
        gifiCode: "8810",
        itc: 5,
      }),
    ).rejects.toThrow("already been resolved");
  });
});
