// Managed project-number issuing (schema.prisma's ProjectNumberCounter
// comment has the full rationale — replaces the old free-text "type
// your own project number" field on New Project). One counter row per
// SectorVariant (28 Aug 2026) so a second demo tenant's projects get
// their own visibly-distinct number block instead of continuing
// whichever sector happened to create a project most recently. Two
// entry points on purpose: peeking (for display on the New Project
// form, before the PM has decided to submit) must never mutate the
// counter, or every page load/abandoned draft would burn a number and
// leave a gap.

import { db } from "./db";

/** Read-only: the number that *would* be issued next, without reserving it. */
export async function peekNextProjectNumber(sectorVariantId: string): Promise<string> {
  const counter = await db.projectNumberCounter.findUnique({ where: { sectorVariantId } });
  return String((counter?.value ?? 0) + 1);
}

/**
 * Atomically reserves and returns the next project number. A single
 * `UPDATE ... SET value = value + 1` is safe under concurrent callers
 * targeting the same sectorVariantId (Postgres row-lock serializes it)
 * — no separate transaction wrapper needed for the increment itself.
 */
export async function issueNextProjectNumber(sectorVariantId: string): Promise<string> {
  const counter = await db.projectNumberCounter.update({
    where: { sectorVariantId },
    data: { value: { increment: 1 } },
  });
  return String(counter.value);
}
