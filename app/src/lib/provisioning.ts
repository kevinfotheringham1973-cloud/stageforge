// The LLM call (ProvisioningModel.html §07): matches a free-text project
// description against the Template library and the known compliance-tag
// vocabulary. Structured outputs with dynamically-built enums are what
// actually enforce §01's "bounded failure mode" decision — an invalid
// templateId or tag is structurally impossible to return, not just
// discouraged by the prompt.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { PrismaClient } from "@prisma/client";
import { CDM_BUILDING_MODIFICATION_TAG } from "./cdm";

const MODEL = "claude-opus-5";

export type ProvisioningMatch = {
  templateId: string;
  tags: string[];
  reasoning: string;
};

export async function matchProject(db: PrismaClient, brief: string): Promise<ProvisioningMatch> {
  const templates = await db.template.findMany({
    where: { matchKeywords: { isEmpty: false } },
    select: { id: true, name: true, description: true, matchKeywords: true },
  });
  if (templates.length === 0) {
    throw new Error("No Templates are set up for AI-assisted provisioning yet — a Compliance Officer needs to author at least one with matchKeywords.");
  }

  const ruleTemplates = await db.complianceRuleTemplate.findMany({ select: { appliesIfTags: true } });
  // Excludes CDM_BUILDING_MODIFICATION_TAG: that tag is driven only by
  // the explicit worksType statutory question, never an LLM guess.
  const knownTags = Array.from(
    new Set(ruleTemplates.flatMap((r) => r.appliesIfTags).filter((t) => t !== CDM_BUILDING_MODIFICATION_TAG))
  ).sort();

  const MatchSchema = z.object({
    templateId: z.enum(templates.map((t) => t.id) as [string, ...string[]]),
    tags:
      knownTags.length > 0
        ? z.array(z.enum(knownTags as [string, ...string[]]))
        : z.array(z.string()).max(0),
    reasoning: z.string(),
  });

  const templateLibraryText = templates
    .map(
      (t) =>
        `- id: ${t.id}\n  name: ${t.name}\n  description: ${t.description ?? "(none)"}\n  keywords: ${t.matchKeywords.join(", ") || "(none)"}`
    )
    .join("\n\n");

  const client = new Anthropic();
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 2048,
    output_config: { effort: "low", format: zodOutputFormat(MatchSchema) },
    system: [
      {
        type: "text",
        text: [
          "You match a free-text Hard FM capital-works project description against a library of pre-authored project templates, and against a fixed vocabulary of compliance tags.",
          "Pick exactly one templateId from the candidates below — the closest match. Never invent a template that isn't listed.",
          "Pick zero or more tags from the known tag list below — only ones that genuinely apply to this project's description (e.g. an occupied/live site, a National Treatment Centre, work affecting water systems). Never invent a tag that isn't listed.",
          "Give a brief reasoning for your pick, for a human reviewer to check.",
          "",
          "Candidate templates:",
          templateLibraryText,
          "",
          `Known compliance tags: ${knownTags.join(", ") || "(none defined yet)"}`,
        ].join("\n"),
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: brief }],
  });

  if (!response.parsed_output) {
    throw new Error("The provisioning match didn't return a valid result — try again or rephrase the description.");
  }
  return response.parsed_output;
}
