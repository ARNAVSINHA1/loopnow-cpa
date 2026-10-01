import type { PrismaClient } from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";

export type DatabaseClient = PrismaClient | Prisma.TransactionClient;
