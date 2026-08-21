// The LLM call (ProvisioningModel.html §07): proposes compliance tags
// for a project against a free-text description, scoped to a Template
// the PM has already explicitly picked from the dropdown (see
// listMatchableTemplates below — matching the discipline itself is a
// closed, known choice, not something worth an LLM guess). Structured
// outputs with a dynamically-built enum are what actually enforce §01's
// "bounded failure mode" decision — an invalid tag is structurally
// impossible to return, not just discouraged by the prompt.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { PrismaClient } from "@prisma/client";
import { CDM_BUILDING_MODIFICATION_TAG, CDM_PRINCIPAL_DESIGNER_TAG, HAISCRIBE_HIGH_INTENSITY_TAG } from "./cdm";

const MODEL = "claude-opus-5";

export type ProvisioningMatch = {
  tags: string[];
  reasoning: string;
};

/**
 * Templates offered for provisioning — the same eligibility filter used
 * by /projects/new's system dropdown, the creator's revise-draft
 * dropdown, and the Compliance Officer's override dropdown on the
 * review page. Clearing a Template's matchKeywords (e.g. the retired
 * Cold Water Storage template, merged into Domestic Hot & Cold Water)
 * is how a template is retired without deleting it.
 */
export async function listMatchableTemplates(db: PrismaClient) {
  return db.template.findMany({
    where: { matchKeywords: { isEmpty: false } },
    orderBy: { name: "asc" },
  });
}

export async function matchComplianceTags(db: PrismaClient, templateId: string, brief: string): Promise<ProvisioningMatch> {
  const template = await db.template.findUniqueOrThrow({
    where: { id: templateId },
    select: { name: true, description: true, matchKeywords: true },
  });

  const ruleTemplates = await db.complianceRuleTemplate.findMany({ select: { appliesIfTags: true } });
  // Excludes the CDM tags (driven only by the explicit worksType
  // statutory question) and the HAI-SCRIBE high-intensity tag (driven
  // only by which Template was picked) — all three are deterministic
  // facts the app already knows once a Template is chosen, never an
  // LLM guess. See lib/cdm.ts's effectiveComplianceTags.
  const DETERMINISTIC_TAGS: string[] = [CDM_BUILDING_MODIFICATION_TAG, CDM_PRINCIPAL_DESIGNER_TAG, HAISCRIBE_HIGH_INTENSITY_TAG];
  const knownTags = Array.from(
    new Set(ruleTemplates.flatMap((r) => r.appliesIfTags).filter((t) => !DETERMINISTIC_TAGS.includes(t)))
  ).sort();

  const MatchSchema = z.object({
    tags:
      knownTags.length > 0
        ? z.array(z.enum(knownTags as [string, ...string[]]))
        : z.array(z.string()).max(0),
    reasoning: z.string(),
  });

  const client = new Anthropic();
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 2048,
    output_config: { effort: "low", format: zodOutputFormat(MatchSchema) },
    system: [
      {
        type: "text",
        text: [
          "You propose compliance tags for a Hard FM capital-works project, given its free-text description and the specific project Template it has already been assigned to (the discipline/system is fixed — do not second-guess it).",
          "Pick zero or more tags from the known tag list below — only ones that genuinely apply to this project's description (e.g. an occupied/live site, a National Treatment Centre, work affecting water systems). Never invent a tag that isn't listed.",
          "Give a brief reasoning for your picks, for a human reviewer to check.",
          "",
          "Assigned template:",
          `- name: ${template.name}`,
          `  description: ${template.description ?? "(none)"}`,
          `  keywords: ${template.matchKeywords.join(", ") || "(none)"}`,
          "",
          `Known compliance tags: ${knownTags.join(", ") || "(none defined yet)"}`,
        ].join("\n"),
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: brief }],
  });

  if (!response.parsed_output) {
    throw new Error("The compliance-tag proposal didn't return a valid result — try again or rephrase the description.");
  }
  return response.parsed_output;
}
