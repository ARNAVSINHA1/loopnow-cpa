import { NextResponse } from "next/server";
import { createReceipt, listReceipts } from "@/server/receipts/receipt.service";

export async function GET() {
  try {
    const receipts = await listReceipts();

    return NextResponse.json({
      data: receipts,
    });
  } catch (error) {
    console.error("Failed to fetch receipts", error);

    return NextResponse.json(
      {
        error: "Unable to fetch receipts",
      },
      {
        status: 500,
      },
    );
  }
}

export async function POST(request: Request) {
  const body = await request.json();

  const receipt = await createReceipt(body);

  return NextResponse.json(
    {
      data: receipt,
    },
    {
      status: 201,
    },
  );
}