import { NextResponse } from "next/server";
import { getProcessingStatus } from "@/server/tools";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    const result = await getProcessingStatus({
      receiptId: id,
    });

    if (result.status === "FAILURE") {
      return NextResponse.json(
        {
          data: result,
        },
        {
          status: 404,
        },
      );
    }

    return NextResponse.json({
      data: result,
    });
  } catch (error) {
    console.error("Failed to get processing status", error);

    return NextResponse.json(
      {
        error: "Unable to get processing status",
      },
      {
        status: 500,
      },
    );
  }
}
