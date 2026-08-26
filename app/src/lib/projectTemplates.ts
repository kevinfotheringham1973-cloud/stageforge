// A Project's full set of constituent Templates — its primary
// `templateId` plus whatever ProjectAdditionalTemplate rows it has
// (see schema.prisma's ProjectAdditionalTemplate comment for why the
// primary/additional split exists). Every caller that needs "all the
// templates this project is built from" — stage instantiation,
// discipline-team suggestion, HAI-SCRIBE tag matching — goes through
// these helpers rather than re-deriving the list inline.
import type { PrismaClient } from "@prisma/client";

export function constituentTemplateIds(project: {
  templateId: string;
  additionalTemplates: { templateId: string }[];
}): string[] {
  return [project.templateId, ...project.additionalTemplates.map((a) => a.templateId)];
}

export async function loadConstituentTemplatesForInstantiation(
  db: PrismaClient,
  project: { templateId: string; additionalTemplates: { templateId: string }[] }
) {
  const templates = await db.template.findMany({
    where: { id: { in: constituentTemplateIds(project) } },
    include: {
      stageTemplates: {
        orderBy: { order: "asc" },
        include: { gateTemplate: { include: { deliverableTemplates: true } } },
      },
    },
  });
  // findMany doesn't preserve `in` order — put the primary template
  // first so callers that treat "index 0" as authoritative (stage
  // ordering, naming) get the right one.
  return templates.sort((a, b) => (a.id === project.templateId ? -1 : b.id === project.templateId ? 1 : 0));
}

// Compliance-rule matching (src/lib/compliance.ts) resolves rules
// against exactly one sectorVariantId per stage instantiation — there's
// no coherent value to pass if a project's constituent templates
// disagree, so merging across sector variants is rejected outright
// rather than silently picking one.
export function assertSameSectorVariant(templates: { name: string; sectorVariantId: string }[]): void {
  const distinct = new Set(templates.map((t) => t.sectorVariantId));
  if (distinct.size > 1) {
    throw new Error(
      `Cannot merge templates from different sector variants into one project (${templates.map((t) => t.name).join(", ")}).`
    );
  }
}
