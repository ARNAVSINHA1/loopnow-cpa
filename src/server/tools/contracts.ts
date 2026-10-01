import { z } from "zod";

export const ToolStatusSchema = z.enum([
  "SUCCESS",
  "FAILURE",
  "REVIEW_REQUIRED",
]);

export const ReceiptIdSchema = z.object({
  receiptId: z.string().min(1),
});

export const GetCurrentReceiptInputSchema = z.object({});

export const GetReceiptDetailsInputSchema = z.object({
  receiptId: z.string().min(1),
});

export const ValidateCraDocumentationInputSchema = z.object({
  receiptId: z.string().min(1),
  total: z.number().nonnegative(),
  gstHstNumber: z.string().nullable(),
});

export const ValidateGstHstNumberFormatInputSchema = z.object({
  receiptId: z.string().min(1),
  gstHstNumber: z.string().nullable(),
});

export const CalculateEligibleItcInputSchema = z.object({
  receiptId: z.string().min(1),
  taxAmount: z.number().nonnegative(),
  eligibilityPercentage: z.number().min(0).max(1),
  documentationStatus: z.enum(["sufficient", "insufficient", "review"]),
});

export const ClassifyExpenseInputSchema = z.object({
  receiptId: z.string().min(1),
  vendor: z.string().min(1),
  description: z.string().nullable(),
});

export const AssignGifiCodeInputSchema = z.object({
  receiptId: z.string().min(1),
  category: z.string().min(1),
  proposedCode: z.string().nullable(),
});

export const UpdateExpenseClassificationInputSchema = z.object({
  receiptId: z.string().min(1),
  category: z.string().min(1),
  gifiCode: z.string().nullable(),
  commercialUsePercentage: z.number().min(0).max(100),
  grossTax: z.number().nonnegative(),
  eligibilityPercentage: z.number().min(0).max(1),
  eligibleItc: z.number().nonnegative(),
  itcStatus: z.enum(["ELIGIBLE", "PARTIAL", "INELIGIBLE", "REVIEW"]),
  classificationStatus: z.enum([
    "PENDING",
    "CLASSIFIED",
    "REVIEW_REQUIRED",
    "REJECTED",
  ]),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1),
});

export const RequestHumanReviewInputSchema = z.object({
  receiptId: z.string().min(1),
  agentRunId: z.string().min(1),
  proposedCategory: z.string().nullable(),
  proposedGifiCode: z.string().nullable(),
  proposedItc: z.number().nonnegative(),
  reason: z.string().min(1),
});

export const GetProcessingStatusInputSchema = z.object({
  receiptId: z.string().min(1),
});

export type GetCurrentReceiptInput = z.infer<
  typeof GetCurrentReceiptInputSchema
>;

export type GetReceiptDetailsInput = z.infer<
  typeof GetReceiptDetailsInputSchema
>;

export type ValidateCraDocumentationInput = z.infer<
  typeof ValidateCraDocumentationInputSchema
>;

export type ValidateGstHstNumberFormatInput = z.infer<
  typeof ValidateGstHstNumberFormatInputSchema
>;

export type CalculateEligibleItcInput = z.infer<
  typeof CalculateEligibleItcInputSchema
>;

export type ClassifyExpenseInput = z.infer<typeof ClassifyExpenseInputSchema>;

export type AssignGifiCodeInput = z.infer<typeof AssignGifiCodeInputSchema>;

export type UpdateExpenseClassificationInput = z.infer<
  typeof UpdateExpenseClassificationInputSchema
>;

export type RequestHumanReviewInput = z.infer<
  typeof RequestHumanReviewInputSchema
>;

export type GetProcessingStatusInput = z.infer<
  typeof GetProcessingStatusInputSchema
>;

export const ReceiptToolStatusSchema = z.enum([
  "SUCCESS",
  "FAILURE",
  "REVIEW_REQUIRED",
]);

export const ReceiptToolDataSchema = z.object({
  id: z.string(),
  vendor: z.string(),
  receiptDate: z.coerce.date().nullable(),
  description: z.string().nullable(),
  subtotal: z.number(),
  taxAmount: z.number(),
  total: z.number(),
  taxType: z.string().nullable(),
  gstHstNumber: z.string().nullable(),
  commercialUsePercentage: z.number().nullable(),
  category: z.string().nullable(),
  receiptAvailable: z.boolean(),
  status: z.string(),
});

export const ReceiptToolResultSchema = z.object({
  status: ReceiptToolStatusSchema,
  receiptId: z.string().nullable(),
  receipt: ReceiptToolDataSchema.optional(),
  message: z.string().optional(),
});

export type ReceiptToolResult = z.infer<typeof ReceiptToolResultSchema>;

export const ClassificationToolResultSchema = z.object({
  category: z.string(),
  gifiCode: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
  mealException: z
    .enum(["standard", "charityOrPublicInstitution", "longHaulTruckDriver"])
    .optional(),
});

export const AssignGifiCodeToolResultSchema = z.object({
  status: z.enum(["SUCCESS", "REVIEW_REQUIRED"]),
  receiptId: z.string(),
  category: z.string(),
  gifiCode: z.string().nullable(),
  description: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  source: z.string().optional(),
  reason: z.string(),
});

export const UpdateExpenseClassificationResultSchema = z.object({
  status: z.enum(["SUCCESS", "REVIEW_REQUIRED", "FAILURE"]),
  receiptId: z.string(),
  category: z.string().nullable(),
  gifiCode: z.string().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  reason: z.string(),
});

export const RequestHumanReviewResultSchema = z.object({
  status: z.enum(["SUCCESS", "FAILURE"]),
  receiptId: z.string(),
  approvalId: z.string().nullable(),
  message: z.string(),
});

export const ProcessingStatusResultSchema = z.object({
  status: z.enum(["SUCCESS", "FAILURE"]),
  receiptId: z.string(),
  receiptStatus: z.string().nullable(),
  agentRunStatus: z.string().nullable(),
  latestTool: z.string().nullable(),
  latestToolStatus: z.string().nullable(),
  pendingApproval: z.boolean(),
  message: z.string(),
});

export const GstHstValidationResultSchema = z.object({
  status: z.enum(["missing", "invalid_format", "valid_format", "unavailable"]),
  normalizedNumber: z.string().nullable(),
  reason: z.string(),
  externallyVerified: z.literal(false),
});
