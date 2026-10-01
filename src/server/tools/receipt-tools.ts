/*
 * Loopnow CPA
 * Receipt Processing & GST/HST Bookkeeping
 *
 * Copyright (c) 2026 Arnava Kumar Sinha. All rights reserved.
 */

import prisma from "@/server/db/prisma";
import type { DatabaseClient } from "@/server/db/types";
import {
  ReceiptToolResultSchema,
  type GetCurrentReceiptInput,
  type GetReceiptDetailsInput,
  type ReceiptToolResult,
} from "./contracts";

export async function getCurrentReceipt(
  _input: GetCurrentReceiptInput,
  selectedReceiptId: string | null,
  db: DatabaseClient = prisma,
): Promise<ReceiptToolResult> {
  if (!selectedReceiptId) {
    return ReceiptToolResultSchema.parse({
      status: "REVIEW_REQUIRED",
      receiptId: null,
      message: "No receipt is currently selected.",
    });
  }

  return getReceiptDetails({ receiptId: selectedReceiptId }, db);
}

export async function getReceiptDetails(
  input: GetReceiptDetailsInput,
  db: DatabaseClient = prisma,
): Promise<ReceiptToolResult> {
  const receipt = await db.receipt.findUnique({
    where: {
      id: input.receiptId,
    },
  });

  if (!receipt) {
    return ReceiptToolResultSchema.parse({
      status: "FAILURE",
      receiptId: input.receiptId,
      message: "Receipt not found.",
    });
  }

  return ReceiptToolResultSchema.parse({
    status: "SUCCESS",
    receiptId: receipt.id,
    receipt: {
      id: receipt.id,
      vendor: receipt.vendor,
      receiptDate: receipt.receiptDate,
      description: receipt.description,
      subtotal: Number(receipt.subtotal),
      taxAmount: Number(receipt.taxAmount),
      total: Number(receipt.total),
      taxType: receipt.taxType,
      gstHstNumber: receipt.gstHstNumber,
      commercialUsePercentage:
        receipt.commercialUsePercentage === null
          ? null
          : Number(receipt.commercialUsePercentage),
      mealExceptionProposal: receipt.mealExceptionProposal,
      category: receipt.category,
      receiptAvailable: receipt.receiptAvailable,
      status: receipt.status,
    },
  });
}
