/*
 * Loopnow CPA
 * Receipt Processing & GST/HST Bookkeeping
 *
 * Copyright (c) 2026 Arnava Kumar Sinha. All rights reserved.
 */

import prisma from "@/server/db/prisma";
import type { DatabaseClient } from "@/server/db/types";

export async function createAgentRun(
  input: {
    receiptId?: string | null;
    requestId?: string | null;
    model?: string | null;
    provider?: string | null;
  },
  db: DatabaseClient = prisma,
) {
  return db.agentRun.create({
    data: {
      receiptId: input.receiptId ?? null,
      requestId: input.requestId ?? null,
      model: input.model ?? null,
      provider: input.provider ?? null,
      status: "RUNNING",
      currentStep: "STARTING",
      currentTool: null,
      iteration: 0,
    },
  });
}

export async function updateAgentRunState(
  agentRunId: string,
  input: {
    currentStep?: string | null;
    currentTool?: string | null;
    iteration?: number;
  },
  db: DatabaseClient = prisma,
) {
  return db.agentRun.update({
    where: { id: agentRunId },
    data: {
      ...(input.currentStep !== undefined
        ? { currentStep: input.currentStep }
        : {}),
      ...(input.currentTool !== undefined
        ? { currentTool: input.currentTool }
        : {}),
      ...(input.iteration !== undefined ? { iteration: input.iteration } : {}),
    },
  });
}

export async function completeAgentRun(
  agentRunId: string,
  db: DatabaseClient = prisma,
) {
  return db.agentRun.update({
    where: { id: agentRunId },
    data: {
      status: "COMPLETED",
      currentStep: "COMPLETED",
      currentTool: null,
      completedAt: new Date(),
      error: null,
    },
  });
}

export async function failAgentRun(
  agentRunId: string,
  error: string,
  db: DatabaseClient = prisma,
) {
  return db.agentRun.update({
    where: { id: agentRunId },
    data: {
      status: "FAILED",
      currentStep: "FAILED",
      currentTool: null,
      completedAt: new Date(),
      error,
    },
  });
}
