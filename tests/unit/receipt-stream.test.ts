import { describe, expect, it, vi } from "vitest";

const getProcessingStatusMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/tools", () => ({
  getProcessingStatus: getProcessingStatusMock,
}));

import { GET } from "../../app/api/receipts/[id]/stream/route";

function status(overrides: Record<string, unknown> = {}) {
  return {
    status: "SUCCESS",
    receiptId: "receipt-stream-test",
    receiptStatus: "PROCESSING",
    agentRunStatus: "RUNNING",
    currentStep: "CLASSIFYING_EXPENSE",
    currentTool: null,
    iteration: 2,
    latestTool: "classify_expense",
    latestToolStatus: "SUCCESS",
    pendingApproval: false,
    message: "Processing",
    ...overrides,
  };
}

async function openStream() {
  return GET(
    new Request("http://localhost/api/receipts/receipt-stream-test/stream"),
    {
      params: Promise.resolve({ id: "receipt-stream-test" }),
    },
  );
}

describe("receipt status SSE", () => {
  it.each([
    ["COMPLETED", "COMPLETED", "agent_run_completed"],
    ["REVIEW_REQUIRED", "COMPLETED", "approval_required"],
    ["ERROR", "FAILED", "agent_run_failed"],
  ])(
    "closes after terminal persisted status %s",
    async (receiptStatus, agentRunStatus, eventName) => {
      getProcessingStatusMock.mockResolvedValue(
        status({ receiptStatus, agentRunStatus }),
      );
      const response = await openStream();
      const reader = response.body!.getReader();
      let payload = "";
      let terminal = await reader.read();

      while (!terminal.done) {
        payload += new TextDecoder().decode(terminal.value);
        terminal = await reader.read();
      }

      expect(response.headers.get("content-type")).toContain(
        "text/event-stream",
      );
      expect(payload).toContain("event: processing_status");
      expect(payload).toContain(`event: ${eventName}`);
      expect(terminal.done).toBe(true);
      expect(getProcessingStatusMock).toHaveBeenCalledTimes(1);
    },
  );

  it("returns the current persisted snapshot on each fresh connection", async () => {
    getProcessingStatusMock.mockResolvedValue(status());

    const firstResponse = await openStream();
    const firstReader = firstResponse.body!.getReader();
    const first = await firstReader.read();
    await firstReader.cancel();

    const secondResponse = await openStream();
    const secondReader = secondResponse.body!.getReader();
    const second = await secondReader.read();
    await secondReader.cancel();

    expect(new TextDecoder().decode(first.value)).toContain('"iteration":2');
    expect(new TextDecoder().decode(second.value)).toContain('"iteration":2');
    expect(getProcessingStatusMock).toHaveBeenCalledTimes(2);
  });
});
