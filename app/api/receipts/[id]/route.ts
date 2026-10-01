/*
 * Loopnow CPA
 * Receipt Processing & GST/HST Bookkeeping
 *
 * Copyright (c) 2026 Arnava Kumar Sinha. All rights reserved.
 */

import { NextResponse } from "next/server";
import { getReceiptById } from "@/server/receipts/receipt.service";

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
        {
          error: "Receipt ID is required",
        },
        {
          status: 400,
        },
      );
    }

    const receipt = await getReceiptById(id);

    if (!receipt) {
      return NextResponse.json(
        {
          error: "Receipt not found",
        },
        {
          status: 404,
        },
      );
    }

    return NextResponse.json({
      data: receipt,
    });
  } catch (error) {
    console.error("Failed to fetch receipt", error);

    return NextResponse.json(
      {
        error: "Unable to fetch receipt",
      },
      {
        status: 500,
      },
    );
  }
}
