import {
  AssignGifiCodeInputSchema,
  CalculateEligibleItcInputSchema,
  ClassifyExpenseInputSchema,
  GetCurrentReceiptInputSchema,
  GetProcessingStatusInputSchema,
  GetReceiptDetailsInputSchema,
  RequestHumanReviewInputSchema,
  UpdateExpenseClassificationInputSchema,
  ValidateCraDocumentationInputSchema,
  ValidateGstHstNumberFormatInputSchema,
} from "./contracts";

import { getCurrentReceipt, getReceiptDetails } from "@/server/tools";

export { getCurrentReceipt, getReceiptDetails } from "./receipt-tools";

export {
  calculateEligibleItc,
  validateCraDocumentation,
  validateGstHstNumberFormat,
} from "./compliance-tools";

export {
  getProcessingStatus,
  requestHumanReview,
  updateExpenseClassification,
} from "./workflow-tools";

export { assignGifiCode, classifyExpenseTool } from "./classification-tools";

export const TOOL_NAMES = [
  "get_current_receipt",
  "get_receipt_details",
  "validate_cra_documentation",
  "validate_gst_hst_number_format",
  "calculate_eligible_itc",
  "classify_expense",
  "assign_gifi_code",
  "update_expense_classification",
  "request_human_review",
  "get_processing_status",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export const TOOL_CONTRACTS = {
  get_current_receipt: {
    description: "Retrieve the currently selected receipt.",
    inputSchema: GetCurrentReceiptInputSchema,
  },

  get_receipt_details: {
    description: "Retrieve detailed information for a receipt.",
    inputSchema: GetReceiptDetailsInputSchema,
  },

  validate_cra_documentation: {
    description:
      "Evaluate receipt documentation requirements using deterministic CRA rules.",
    inputSchema: ValidateCraDocumentationInputSchema,
  },

  validate_gst_hst_number_format: {
    description:
      "Validate the syntax and format of a GST/HST registration number.",
    inputSchema: ValidateGstHstNumberFormatInputSchema,
  },

  calculate_eligible_itc: {
    description:
      "Calculate eligible GST/HST input tax credits using deterministic rules.",
    inputSchema: CalculateEligibleItcInputSchema,
  },

  classify_expense: {
    description: "Classify a receipt expense using the configured classifier.",
    inputSchema: ClassifyExpenseInputSchema,
  },

  assign_gifi_code: {
    description:
      "Validate and assign a GIFI code from the controlled catalogue.",
    inputSchema: AssignGifiCodeInputSchema,
  },

  update_expense_classification: {
    description: "Persist an expense classification after backend validation.",
    inputSchema: UpdateExpenseClassificationInputSchema,
  },

  request_human_review: {
    description:
      "Create a human-review request when deterministic processing cannot safely complete.",
    inputSchema: RequestHumanReviewInputSchema,
  },

  get_processing_status: {
    description: "Retrieve the current processing status for a receipt.",
    inputSchema: GetProcessingStatusInputSchema,
  },
} as const;
