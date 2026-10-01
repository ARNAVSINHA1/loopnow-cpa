/*
 * Loopnow CPA
 * Receipt Processing & GST/HST Bookkeeping
 *
 * Copyright (c) 2026 Arnava Kumar Sinha. All rights reserved.
 */

import { prisma } from "@/server/db";
import type { CreateReceiptInput } from "./receipt.schema";

export async function listReceipts() {
  return prisma.receipt.findMany({
    include: {
      expense: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getReceiptById(id: string) {
  return prisma.receipt.findUnique({
    where: {
      id,
    },
    include: {
      expense: true,
      approvals: {
        orderBy: {
          createdAt: "desc",
        },
      },
      auditEvents: {
        orderBy: {
          timestamp: "desc",
        },
      },
    },
  });
}

export async function createReceipt(input: CreateReceiptInput) {
  return prisma.$transaction(async (tx) => {
    const receipt = await tx.receipt.create({
      data: {
        vendor: input.vendor,
        receiptDate: input.receiptDate
          ? new Date(input.receiptDate)
          : undefined,
        description: input.description,
        subtotal: input.subtotal,
        taxAmount: input.taxAmount,
        total: input.total,
        taxType: input.taxType,
        gstHstNumber: input.gstHstNumber,
        commercialUsePercentage: input.commercialUsePercentage,
        mealExceptionProposal: input.mealExceptionProposal,
      },
    });

    await tx.auditEvent.create({
      data: {
        actor: "system",
        receiptId: receipt.id,
        agentRunId: null,
        action: "RECEIPT_CREATED",
        status: "SUCCESS",
        metadata: {
          vendor: receipt.vendor,
          total: receipt.total.toString(),
        },
      },
    });

    return receipt;
  });
}
