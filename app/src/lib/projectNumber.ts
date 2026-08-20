// Managed project-number issuing (schema.prisma's ProjectNumberCounter
// comment has the full rationale — replaces the old free-text "type
// your own project number" field on New Project). Two entry points on
// purpose: peeking (for display on the New Project form, before the PM
// has decided to submit) must never mutate the counter, or every page
// load/abandoned draft would burn a number and leave a gap.

import { db } from "./db";

const COUNTER_ID = 1;

/** Read-only: the number that *would* be issued next, without reserving it. */
export async function peekNextProjectNumber(): Promise<string> {
  const counter = await db.projectNumberCounter.findUnique({ where: { id: COUNTER_ID } });
  return String((counter?.value ?? 0) + 1);
}

/**
 * Atomically reserves and returns the next project number. A single
 * `UPDATE ... SET value = value + 1` is safe under concurrent callers
 * (Postgres row-lock serializes it) — no separate transaction wrapper
 * needed for the increment itself.
 */
export async function issueNextProjectNumber(): Promise<string> {
  const counter = await db.projectNumberCounter.update({
    where: { id: COUNTER_ID },
    data: { value: { increment: 1 } },
  });
  return String(counter.value);
}
