import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { processApproval } from "@/server/approvals/approval.service";

const approvalSchema = z.object({
  action: z.enum(["APPROVE", "REJECT", "EDIT"]),
  reviewer: z.string().min(1),
  category: z.string().min(1).optional(),
  gifiCode: z.string().min(1).optional(),
  itc: z.number().nonnegative().optional(),
  decision: z.string().optional(),
});

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
  try {
    const { id } = await context.params;

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

    const body = await request.json();

    const parsed = approvalSchema.safeParse(body);

    if (!parsed.success) {
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

    const result = await processApproval({
      approvalId: id,
      ...parsed.data,
    });

    return NextResponse.json({
      data: result,
    });
  } catch (error) {
    console.error("Failed to process approval", error);

    const message =
      error instanceof Error ? error.message : "Unable to process approval";

    if (message === "Approval not found") {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    if (message === "Approval has already been decided") {
      return NextResponse.json({ error: message }, { status: 409 });
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
