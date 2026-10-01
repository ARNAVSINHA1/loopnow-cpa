import { NextResponse } from "next/server";
import { processReceipt } from "@/server/processing/receipt.processor";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(
  _request: Request,
  context: RouteContext,
) {
  try {
    const { id } = await context.params;

    const result = await processReceipt(id);

    return NextResponse.json({
      data: result,
    });
  } catch (error) {
    console.error("Failed to process receipt", error);

    return NextResponse.json(
      {
        error: "Unable to process receipt",
      },
      {
        status: 500,
      },
    );
  }
}