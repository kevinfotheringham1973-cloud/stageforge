import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient();

// A real PrismaClient, or the client Prisma hands an interactive
// transaction's callback (db.$transaction(async (tx) => ...)) --
// structurally almost identical for query methods, but missing
// $transaction/$connect/etc, so TypeScript won't accept one where a
// bare PrismaClient is required without this union. Lets functions like
// instantiateStage/generateEnglandVariant/seedEnglandDemo run either
// standalone (the live app's normal Server Actions) or as part of a
// caller's own transaction (prisma/seed.ts, so an interrupted seed run
// rolls back atomically instead of leaving partial data -- see that
// file's header comment) without two copies of each function.
export type DbClient = PrismaClient | Prisma.TransactionClient;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
