import { z } from "zod";

export const createReceiptSchema = z
  .object({
    vendor: z.string().min(2),
    receiptDate: z.string().datetime().optional(),
    description: z.string().optional(),

    subtotal: z.number().nonnegative(),
    taxAmount: z.number().nonnegative(),
    total: z.number().nonnegative(),

    taxType: z.string().optional(),
    gstHstNumber: z.string().optional(),

    commercialUsePercentage: z.number().min(0).max(100).optional(),
    mealExceptionProposal: z.string().optional(),
  })
  .strict();

export type CreateReceiptInput = z.infer<typeof createReceiptSchema>;
