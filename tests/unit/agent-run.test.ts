import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    agentRun: {
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/server/db/prisma", () => ({
  default: prismaMock,
}));

import {
  completeAgentRun,
  createAgentRun,
  failAgentRun,
} from "@/server/agent/agent-run";

describe("agent run lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a running agent run", async () => {
    prismaMock.agentRun.create.mockResolvedValue({
      id: "run-1",
      status: "RUNNING",
    });

    const result = await createAgentRun({
      receiptId: "receipt-1",
      requestId: "request-1",
      model: "cpa-copilot-v1",
      provider: "test",
    });

    expect(prismaMock.agentRun.create).toHaveBeenCalledWith({
      data: {
        receiptId: "receipt-1",
        requestId: "request-1",
        model: "cpa-copilot-v1",
        provider: "test",
        status: "RUNNING",
      },
    });

    expect(result.status).toBe("RUNNING");
  });

  it("completes an agent run", async () => {
    prismaMock.agentRun.update.mockResolvedValue({
      id: "run-1",
      status: "COMPLETED",
    });

    const result = await completeAgentRun("run-1");

    expect(prismaMock.agentRun.update).toHaveBeenCalledWith({
      where: {
        id: "run-1",
      },
      data: {
        status: "COMPLETED",
        completedAt: expect.any(Date),
        error: null,
      },
    });

    expect(result.status).toBe("COMPLETED");
  });

  it("fails an agent run with an error", async () => {
    prismaMock.agentRun.update.mockResolvedValue({
      id: "run-1",
      status: "FAILED",
      error: "Tool execution failed",
    });

    const result = await failAgentRun("run-1", "Tool execution failed");

    expect(prismaMock.agentRun.update).toHaveBeenCalledWith({
      where: {
        id: "run-1",
      },
      data: {
        status: "FAILED",
        completedAt: expect.any(Date),
        error: "Tool execution failed",
      },
    });

    expect(result.status).toBe("FAILED");
  });
});
