import prisma from "@/server/db/prisma";
import type { DatabaseClient } from "@/server/db/types";

import {
  AssignGifiCodeInputSchema,
  AssignGifiCodeToolResultSchema,
  CalculateEligibleItcInputSchema,
  ClassifyExpenseInputSchema,
  ClassificationToolResultSchema,
  GetCurrentReceiptInputSchema,
  GetProcessingStatusInputSchema,
  GetReceiptDetailsInputSchema,
  GstHstValidationResultSchema,
  ProcessingStatusResultSchema,
  RequestHumanReviewInputSchema,
  RequestHumanReviewResultSchema,
  UpdateExpenseClassificationInputSchema,
  UpdateExpenseClassificationResultSchema,
  ValidateCraDocumentationInputSchema,
  ValidateGstHstNumberFormatInputSchema,
} from "./contracts";

import { getCurrentReceipt, getReceiptDetails } from "./receipt-tools";

import {
  calculateEligibleItc,
  validateCraDocumentation,
  validateGstHstNumberFormat,
} from "./compliance-tools";

import { assignGifiCode, classifyExpenseTool } from "./classification-tools";

import {
  getProcessingStatus,
  requestHumanReview,
  updateExpenseClassification,
} from "./workflow-tools";

export type ToolExecutionContext = {
  selectedReceiptId: string | null;
  agentRunId: string;
  db: DatabaseClient;
};

export type ToolExecutionResult = {
  toolCallId: string;
  toolName: string;
  status: "SUCCESS" | "FAILURE" | "REVIEW_REQUIRED";
  output: unknown;
};

type InternalToolExecutionResult = {
  toolName: string;
  status: "SUCCESS" | "FAILURE" | "REVIEW_REQUIRED";
  output: unknown;
};

async function executeToolInternal(
  toolName: string,
  input: unknown,
  context: ToolExecutionContext,
): Promise<InternalToolExecutionResult> {
  switch (toolName) {
    case "get_current_receipt": {
      const parsed = GetCurrentReceiptInputSchema.parse(input);

      const output = await getCurrentReceipt(
        parsed,
        context.selectedReceiptId,
        context.db,
      );

      return {
        toolName,
        status: output.status,
        output,
      };
    }

    case "get_receipt_details": {
      const parsed = GetReceiptDetailsInputSchema.parse(input);

      const output = await getReceiptDetails(parsed, context.db);

      return {
        toolName,
        status: output.status,
        output,
      };
    }

    case "validate_cra_documentation": {
      const parsed = ValidateCraDocumentationInputSchema.parse(input);

      const output = await validateCraDocumentation(parsed);

      return {
        toolName,
        status:
          output.status === "review"
            ? "REVIEW_REQUIRED"
            : output.status === "sufficient"
              ? "SUCCESS"
              : "FAILURE",
        output,
      };
    }

    case "validate_gst_hst_number_format": {
      const parsed = ValidateGstHstNumberFormatInputSchema.parse(input);

      const output = GstHstValidationResultSchema.parse(
        await validateGstHstNumberFormat(parsed),
      );

      return {
        toolName,
        status:
          output.status === "valid_format"
            ? "SUCCESS"
            : output.status === "missing"
              ? "REVIEW_REQUIRED"
              : "FAILURE",
        output,
      };
    }

    case "calculate_eligible_itc": {
      const parsed = CalculateEligibleItcInputSchema.parse(input);

      const output = await calculateEligibleItc(parsed);

      return {
        toolName,
        status: output.status === "review" ? "REVIEW_REQUIRED" : "SUCCESS",
        output,
      };
    }

    case "classify_expense": {
      const parsed = ClassifyExpenseInputSchema.parse(input);

      const output = await classifyExpenseTool(parsed);

      return {
        toolName,
        status: output.gifiCode === null ? "REVIEW_REQUIRED" : "SUCCESS",
        output: ClassificationToolResultSchema.parse(output),
      };
    }

    case "assign_gifi_code": {
      const parsed = AssignGifiCodeInputSchema.parse(input);

      const output = await assignGifiCode(parsed);

      return {
        toolName,
        status: output.status,
        output: AssignGifiCodeToolResultSchema.parse(output),
      };
    }

    case "update_expense_classification": {
      const parsed = UpdateExpenseClassificationInputSchema.parse(input);

      const output = await updateExpenseClassification(parsed, context.db);

      return {
        toolName,
        status: output.status,
        output: UpdateExpenseClassificationResultSchema.parse(output),
      };
    }

    case "request_human_review": {
      const parsed = RequestHumanReviewInputSchema.parse(input);

      const output = await requestHumanReview(parsed, context.db);

      return {
        toolName,
        status: output.status,
        output: RequestHumanReviewResultSchema.parse(output),
      };
    }

    case "get_processing_status": {
      const parsed = GetProcessingStatusInputSchema.parse(input);

      const output = await getProcessingStatus(parsed, context.db);

      return {
        toolName,
        status: output.status,
        output: ProcessingStatusResultSchema.parse(output),
      };
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

function mapToolCallStatus(
  status: InternalToolExecutionResult["status"],
): "SUCCESS" | "FAILED" {
  return status === "SUCCESS" ? "SUCCESS" : "FAILED";
}

export async function executeTool(
  toolName: string,
  input: unknown,
  context: ToolExecutionContext,
): Promise<ToolExecutionResult> {
  const startedAt = Date.now();

  const toolCall = await context.db.toolCall.create({
    data: {
      agentRunId: context.agentRunId,
      toolName,
      input: input as object,
      status: "RUNNING",
    },
  });

  try {
    const result = await executeToolInternal(toolName, input, context);

    const latencyMs = Date.now() - startedAt;

    await context.db.toolCall.update({
      where: {
        id: toolCall.id,
      },
      data: {
        output: result.output as object,
        status: mapToolCallStatus(result.status),
        completedAt: new Date(),
        latencyMs,
      },
    });

    return {
      toolCallId: toolCall.id,
      toolName: result.toolName,
      status: result.status,
      output: result.output,
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;

    const message =
      error instanceof Error ? error.message : "Unknown tool execution error.";

    await context.db.toolCall.update({
      where: {
        id: toolCall.id,
      },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        latencyMs,
        error: message,
      },
    });

    throw error;
  }
}
