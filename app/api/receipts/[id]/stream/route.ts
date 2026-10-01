/*
 * Loopnow CPA
 * Receipt Processing & GST/HST Bookkeeping
 *
 * Copyright (c) 2026 Arnava Kumar Sinha. All rights reserved.
 */

import { getProcessingStatus } from "@/server/tools";

type ProcessingSnapshot = Awaited<ReturnType<typeof getProcessingStatus>>;

export function isTerminalProcessingSnapshot(status: ProcessingSnapshot) {
  return (
    status.status === "FAILURE" ||
    status.agentRunStatus === "FAILED" ||
    ["COMPLETED", "REVIEW_REQUIRED", "ERROR"].includes(
      status.receiptStatus ?? "",
    )
  );
}

export async function GET(
  request: Request,
  context: {
    params: Promise<{ id: string }>;
  },
) {
  const { id } = await context.params;
  const encoder = new TextEncoder();
  let stopStream = () => {};

  const stream = new ReadableStream({
    start(controller) {
      let previousStatus: ProcessingSnapshot | null = null;
      let timer: ReturnType<typeof setTimeout> | null = null;
      let closed = false;

      const emit = (event: string, payload: unknown) => {
        if (closed) return;

        controller.enqueue(
          encoder.encode(
            `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`,
          ),
        );
      };

      const clearTimer = () => {
        if (timer) clearTimeout(timer);
        timer = null;
      };

      const close = () => {
        if (closed) return;
        closed = true;
        clearTimer();
        request.signal.removeEventListener("abort", close);
        controller.close();
      };

      stopStream = () => {
        if (closed) return;
        closed = true;
        clearTimer();
        request.signal.removeEventListener("abort", close);
      };

      request.signal.addEventListener("abort", close, { once: true });

      const pushSnapshot = async () => {
        if (closed) return;

        try {
          const status = await getProcessingStatus({ receiptId: id });

          if (status.status === "FAILURE") {
            emit("stream_error", status);
            close();
            return;
          }

          if (!previousStatus) {
            emit("processing_status", status);
          } else {
            if (status.agentRunStatus !== previousStatus.agentRunStatus) {
              if (status.agentRunStatus === "RUNNING") {
                emit("agent_run_started", status);
              }
              if (status.agentRunStatus === "COMPLETED") {
                emit("agent_run_completed", status);
              }
              if (status.agentRunStatus === "FAILED") {
                emit("agent_run_failed", status);
              }
            }

            if (status.currentStep !== previousStatus.currentStep) {
              emit("step_changed", status);
            }

            if (status.currentTool !== previousStatus.currentTool) {
              emit(
                status.currentTool ? "tool_started" : "tool_completed",
                status,
              );
            }

            if (
              status.latestTool !== previousStatus.latestTool ||
              status.latestToolStatus !== previousStatus.latestToolStatus
            ) {
              emit("tool_completed", status);
            }

            if (status.pendingApproval && !previousStatus.pendingApproval) {
              emit("approval_required", status);
            }

            if (
              status.agentRunStatus !== previousStatus.agentRunStatus ||
              status.currentStep !== previousStatus.currentStep ||
              status.currentTool !== previousStatus.currentTool ||
              status.latestTool !== previousStatus.latestTool ||
              status.latestToolStatus !== previousStatus.latestToolStatus ||
              status.iteration !== previousStatus.iteration ||
              status.receiptStatus !== previousStatus.receiptStatus
            ) {
              emit("processing_status", status);
            }
          }

          previousStatus = status;

          if (isTerminalProcessingSnapshot(status)) {
            if (status.receiptStatus === "REVIEW_REQUIRED") {
              emit("approval_required", status);
            } else if (
              status.agentRunStatus === "FAILED" ||
              status.receiptStatus === "ERROR"
            ) {
              emit("agent_run_failed", status);
            } else {
              emit("agent_run_completed", status);
            }
            close();
            return;
          }
        } catch (error) {
          emit("stream_error", {
            status: "FAILURE",
            receiptId: id,
            message:
              error instanceof Error
                ? error.message
                : "Unable to stream status.",
          });
          close();
        }
      };

      const poll = async () => {
        await pushSnapshot();
        if (!closed) timer = setTimeout(() => void poll(), 1500);
      };

      void poll();
    },
    cancel() {
      stopStream();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
