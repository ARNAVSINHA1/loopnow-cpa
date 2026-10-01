import { NextResponse } from "next/server";
import {
  listReceipts,
  createReceipt,
} from "@/server/receipts/receipt.service";
import { createReceiptSchema } from "@/server/receipts/receipt.schema";

export async function GET() {
  const receipts = await listReceipts();

  return NextResponse.json({
    data: receipts,
  });
}


export async function POST(
  request: Request,
) {
  try {
    const body = await request.json();

    const parsed =
      createReceiptSchema.safeParse(body);

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

    const receipt =
      await createReceipt(parsed.data);

    return NextResponse.json(
      {
        data: receipt,
      },
      {
        status: 201,
      },
    );

  } catch (error) {
    console.error(
      "Failed to create receipt",
      error,
    );

    return NextResponse.json(
      {
        error: "Unable to create receipt",
      },
      {
        status: 500,
      },
    );
  }
}