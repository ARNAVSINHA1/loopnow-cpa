import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../../src/server/db";
import { processReceipt } from "../../src/server/processing/receipt.processor";

const TEST_RECEIPT_ID = "integration-meal-receipt";

describe("Receipt processor integration", () => {
  beforeAll(async () => {
    await prisma.receipt.deleteMany({
      where: {
        id: TEST_RECEIPT_ID,
      },
    });

    await prisma.receipt.create({
      data: {
        id: TEST_RECEIPT_ID,
        vendor: "The Keg",
        description: "Business dinner",
        subtotal: 240,
        taxAmount: 12,
        total: 252,
        taxType: "GST/HST",
        gstHstNumber: "123456789RT0001",
        commercialUsePercentage: 100,
        category: "Unknown",
        receiptAvailable: true,
        status: "PENDING",
      },
    });
  });

  afterAll(async () => {
    const receipt = await prisma.receipt.findUnique({
      where: {
        id: TEST_RECEIPT_ID,
      },
      include: {
        agentRuns: true,
      },
    });

    if (receipt) {
      await prisma.toolCall.deleteMany({
        where: {
          agentRunId: {
            in: receipt.agentRuns.map((run) => run.id),
          },
        },
      });

      await prisma.auditEvent.deleteMany({
        where: {
          receiptId: TEST_RECEIPT_ID,
        },
      });

      await prisma.approval.deleteMany({
        where: {
          receiptId: TEST_RECEIPT_ID,
        },
      });

      await prisma.expense.deleteMany({
        where: {
          receiptId: TEST_RECEIPT_ID,
        },
      });

      await prisma.agentRun.deleteMany({
        where: {
          receiptId: TEST_RECEIPT_ID,
        },
      });

      await prisma.receipt.delete({
        where: {
          id: TEST_RECEIPT_ID,
        },
      });
    }

    await prisma.$disconnect();
  });

  it("processes a business meal with the deterministic 50% ITC limitation", async () => {
    const result = await processReceipt(TEST_RECEIPT_ID);

    expect(result.status).toBe("COMPLETED");
    expect(result.classification).toBe("Meals and Entertainment");
    expect(result.gifiCode).toBe("8523");
    expect(result.documentationStatus).toBe("sufficient");
    expect(result.itcStatus).toBe("partial");
    expect(result.eligibleItc).toBe(6);
    expect(result.requiresReview).toBe(false);

    const receipt = await prisma.receipt.findUnique({
      where: {
        id: TEST_RECEIPT_ID,
      },
      include: {
        expense: true,
        approvals: true,
        auditEvents: true,
        agentRuns: {
          include: {
            toolCalls: true,
          },
        },
      },
    });

    expect(receipt).not.toBeNull();

    expect(receipt?.status).toBe("COMPLETED");

    expect(receipt?.expense).not.toBeNull();

    expect(receipt?.expense?.category).toBe(
      "Meals and Entertainment",
    );

    expect(receipt?.expense?.gifiCode).toBe("8523");

    expect(
      Number(receipt?.expense?.commercialUsePercentage),
    ).toBe(100);

    expect(
      Number(receipt?.expense?.eligibilityPercentage),
    ).toBe(0.5);

    expect(Number(receipt?.expense?.grossTax)).toBe(12);

    expect(Number(receipt?.expense?.eligibleItc)).toBe(6);

    expect(receipt?.expense?.itcStatus).toBe("PARTIAL");

    expect(receipt?.expense?.classificationStatus).toBe(
      "CLASSIFIED",
    );

    expect(receipt?.approvals).toHaveLength(0);

    const toolCalls =
      receipt?.agentRuns.flatMap((run) => run.toolCalls) ?? [];

    const toolNames = toolCalls.map((toolCall) => toolCall.toolName);

    expect(toolNames).toContain(
      "validate_gst_hst_number_format",
    );
    expect(toolNames).toContain("documentation_rules");
    expect(toolNames).toContain("expense_classification");
    expect(toolNames).toContain("gifi_mapping");
    expect(toolNames).toContain("itc_calculation");
    expect(toolNames).toContain("self_verification");

    const itcToolCall = toolCalls.find(
      (toolCall) => toolCall.toolName === "itc_calculation",
    );

    expect(itcToolCall).toBeDefined();

    expect(itcToolCall?.output).toMatchObject({
      eligibleITC: 6,
      status: "partial",
    });

    const completionAudit = receipt?.auditEvents.find(
      (event) => event.action === "PROCESSING_COMPLETED",
    );

    expect(completionAudit).toBeDefined();

    expect(completionAudit?.status).toBe("SUCCESS");

    expect(completionAudit?.metadata).toMatchObject({
      gifiCode: "8523",
      itcStatus: "partial",
      eligibleItc: 6,
      classification: "Meals and Entertainment",
      documentationStatus: "sufficient",
      gstHstValidationStatus: "valid_format",
      verificationPassed: true,
    });
  });
});