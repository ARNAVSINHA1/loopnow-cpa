/*
 * Loopnow CPA
 * Receipt Processing & GST/HST Bookkeeping
 *
 * Copyright (c) 2026 Arnava Kumar Sinha. All rights reserved.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import {
  processApproval,
  recordApprovalFailure,
} from "@/server/approvals/approval.service";
import { authorizeReviewer } from "@/server/approvals/reviewer-auth";

const approvalSchema = z
  .object({
    action: z.enum(["APPROVE", "REJECT", "EDIT"]),
    category: z.string().min(1).optional(),
    gifiCode: z.string().min(1).optional(),
    itc: z.number().nonnegative().optional(),
    mealException: z.string().optional(),
    decision: z.string().optional(),
  })
  .strict();

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { error: "Approval ID is required" },
        { status: 400 },
      );
    }

    const approval = await prisma.approval.findUnique({
      where: { id },
      include: {
        receipt: {
          include: {
            expense: true,
          },
        },
      },
    });

    if (!approval) {
      return NextResponse.json(
        { error: "Approval not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: approval });
  } catch (error) {
    console.error("Failed to fetch approval", error);

    return NextResponse.json(
      { error: "Unable to fetch approval" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  let id = "";
  let reviewerId = "unauthenticated";
  let serviceInvoked = false;

  try {
    ({ id } = await context.params);

    if (!id) {
      return NextResponse.json(
        {
          error: "Approval ID is required",
        },
        {
          status: 400,
        },
      );
    }

    const authorization = authorizeReviewer(request);

    if (authorization.status !== "AUTHORIZED") {
      await recordApprovalFailure({
        approvalId: id,
        actor: "unauthenticated",
        action: "AUTHORIZATION_DENIED",
        reason:
          authorization.status === "NOT_CONFIGURED"
            ? "Reviewer authorization is not configured."
            : "Reviewer authorization failed.",
      }).catch(() => undefined);

      return NextResponse.json(
        {
          error:
            authorization.status === "NOT_CONFIGURED"
              ? "Reviewer authorization is not configured"
              : "Unauthorized reviewer",
        },
        { status: authorization.status === "NOT_CONFIGURED" ? 503 : 401 },
      );
    }

    reviewerId = authorization.reviewerId;

    const body = await request.json();

    const parsed = approvalSchema.safeParse(body);

    if (!parsed.success) {
      await recordApprovalFailure({
        approvalId: id,
        actor: reviewerId,
        action: "INVALID_REQUEST",
        reason: "Approval request failed schema validation.",
      }).catch(() => undefined);

      return NextResponse.json(
        {
          error: "Validation failed",
          details: parsed.error.flatten(),
        },
        {
          status: 400,
        },
      );
    }

    serviceInvoked = true;
    const result = await processApproval({
      approvalId: id,
      reviewer: reviewerId,
      ...parsed.data,
    });

    return NextResponse.json({
      data: result,
    });
  } catch (error) {
    console.error("Failed to process approval", error);

    const message =
      error instanceof Error ? error.message : "Unable to process approval";

    if (id && !serviceInvoked) {
      await recordApprovalFailure({
        approvalId: id,
        actor: reviewerId,
        action: "INVALID_REQUEST",
        reason: "Approval request could not be processed.",
      }).catch(() => undefined);
    }

    if (message === "Approval not found") {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    if (message === "Approval has already been decided") {
      return NextResponse.json({ error: message }, { status: 409 });
    }

    if (
      message === "Receipt has already been resolved." ||
      message === "Receipt is not awaiting human review."
    ) {
      return NextResponse.json({ error: message }, { status: 409 });
    }

    if (
      message.startsWith("Expense category") ||
      message.startsWith("GIFI") ||
      message.startsWith("A controlled GIFI") ||
      message.startsWith("ITC ") ||
      message.startsWith("Client ITC") ||
      message.startsWith("Stored commercial-use") ||
      message.startsWith("Stored tax") ||
      message.startsWith("A supported meal exception") ||
      message.startsWith("Meal exceptions")
    ) {
      return NextResponse.json({ error: message }, { status: 422 });
    }

    return NextResponse.json(
      {
        error: "Unable to process approval",
      },
      {
        status: 500,
      },
    );
  }
}
