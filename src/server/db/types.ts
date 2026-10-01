/*
 * Loopnow CPA
 * Receipt Processing & GST/HST Bookkeeping
 *
 * Copyright (c) 2026 Arnava Kumar Sinha. All rights reserved.
 */

import type { PrismaClient } from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";

export type DatabaseClient = PrismaClient | Prisma.TransactionClient;
