// Static reference data, not DB-backed: the SHTM->HTM conversion table
// Kevin supplied (Regulation Conversion_England_Scotland.docx, 24 Aug
// 2026) for what it would take to stand up an England-jurisdiction
// tenant from the existing Scotland-only template library. Kept as
// plain data rather than seeded Template/ComplianceRuleSet rows because
// nothing here is live yet — there's no second SectorVariant, no
// England tenant, and the source document itself only maps *guidance
// references* (SHTM 04-01 -> HTM 04-01 etc.), not actual English
// deliverable text to seed. That's exactly the kind of prep a future
// onboarding conversation needs on hand without requiring 22 templates
// (see prisma seed) to be spuriously duplicated today.
//
// `templateKeys` is a best-effort link back to the live Template(s)
// each row corresponds to, for rows unambiguous enough to match by
// name (empty array where the mapping isn't 1:1, e.g. the doc's single
// "Electrical Services" row loosely spans two live templates that split
// after the source document was written).
export type RegulationConversionRow = {
  system: string;
  scotland: string;
  england: string;
  notes: string;
  effort: "low" | "medium" | "high";
  templateKeys: string[];
};

export const REGULATION_CONVERSION_ROWS: RegulationConversionRow[] = [
  {
    system: "Valve / Boiler Replacement (LTHW)",
    scotland: "SHTM 00 + SHTM 04-01 principles",
    england: "HTM 00 + HTM 04-01 principles",
    notes: "Very similar",
    effort: "low",
    templateKeys: ["template.health.boiler_heating_plant_replacement"],
  },
  {
    system: "Heating Systems",
    scotland: "SHTM 00 + SHTM 04-01",
    england: "HTM 00 + HTM 04-01",
    notes: "Very similar",
    effort: "low",
    templateKeys: [],
  },
  {
    system: "Ventilation Systems",
    scotland: "SHTM 03-01",
    england: "HTM 03-01",
    notes: "Very similar content",
    effort: "low",
    templateKeys: ["template.health.ventilation_systems_replacement"],
  },
  {
    system: "Medical Gas Pipeline Systems (incl. Pendants)",
    scotland: "SHTM 02-01",
    england: "HTM 02-01",
    notes: "Very similar",
    effort: "low",
    templateKeys: ["template.health.medical_gas_systems_replacement"],
  },
  {
    system: "Fire Detection & Alarm Systems",
    scotland: "SHTM 82",
    england: "HTM 05-03 series + BS 5839-1",
    notes: "Structure differs (Firecode organisation)",
    effort: "medium",
    templateKeys: ["template.health.fire_alarm_detection_replacement"],
  },
  {
    system: "Lifts",
    scotland: "SHTM 08-02",
    england: "HTM 08-02",
    notes: "Very similar",
    effort: "low",
    templateKeys: ["template.health.lift_systems_replacement"],
  },
  {
    system: "Nurse Call & Staff Paging Systems",
    scotland: "SHTM 08-03",
    england: "HTM 08-03",
    notes: "Very similar",
    effort: "low",
    templateKeys: ["template.health.nurse_call_staff_paging_replacement"],
  },
  {
    system: "Building Management System (BMS / BEMS)",
    scotland: "SHTM 00 + CIBSE / BSRIA",
    england: "HTM 00 + CIBSE / BSRIA",
    notes: "Almost identical",
    effort: "low",
    templateKeys: ["template.health.bms_replacement"],
  },
  {
    system: "Electrical Services",
    scotland: "SHTM 06 series",
    england: "HTM 06 series",
    notes: "Very similar",
    effort: "low",
    templateKeys: ["template.health.electrical_services_replacement", "template.health.lighting_replacement"],
  },
  {
    system: "Domestic Hot & Cold Water Systems",
    scotland: "SHTM 04-01 (Parts A-G)",
    england: "HTM 04-01",
    notes: "Very similar (minor structural differences)",
    effort: "low",
    templateKeys: ["template.health.domestic_hot_cold_water_replacement"],
  },
  {
    system: "Chilled Water / Cooling Systems",
    scotland: "SHTM 03-01 (linked) + CIBSE",
    england: "HTM 03-01 (linked) + CIBSE",
    notes: "Very similar",
    effort: "low",
    templateKeys: ["template.health.chilled_water_cooling_replacement"],
  },
  {
    system: "Steam Systems",
    scotland: "SHTM 00 + PSSR",
    england: "HTM 00 + PSSR",
    notes: "PSSR is UK-wide (no change)",
    effort: "low",
    templateKeys: ["template.health.steam_systems_replacement"],
  },
  {
    system: "Fire Suppression Systems",
    scotland: "SHTM 81 (Firecode) + BS EN standards",
    england: "HTM 05 series (Firecode) + BS EN standards",
    notes: "Firecode structure differs",
    effort: "medium",
    templateKeys: ["template.health.fire_suppression_replacement"],
  },
  {
    system: "Security Systems",
    scotland: "NHS Scotland Security Standards + BS EN",
    england: "NHS England Security / Estates guidance + BS EN",
    notes: "Local NHS policy differences",
    effort: "low",
    templateKeys: ["template.health.security_systems_replacement"],
  },
  {
    system: "Pneumatic Tube Systems",
    scotland: "Manufacturer + Clinical / IPC",
    england: "Manufacturer + Clinical / IPC",
    notes: "No significant difference",
    effort: "low",
    templateKeys: ["template.health.pneumatic_tube_system_replacement"],
  },
  {
    system: "Above-ground Drainage / Public Health",
    scotland: "Building Standards (Scotland) + BS EN 12056",
    england: "Building Regulations (England) + BS EN 12056",
    notes: "Different national building regulations",
    effort: "low",
    templateKeys: ["template.health.above_ground_drainage_replacement"],
  },
  {
    system: "Compressed Air (Non-Medical)",
    scotland: "SHTM 00 + PSSR",
    england: "HTM 00 + PSSR",
    notes: "PSSR is UK-wide (no change)",
    effort: "low",
    templateKeys: ["template.health.compressed_air_systems_replacement"],
  },
  {
    system: "Ward / Theatre / Clinical Area Refurbishment (incl. MH Ligature)",
    scotland: "SHTM 00 + HAI-SCRIBE (SHFN 30) + anti-ligature guidance",
    england: "HTM 00 + local IPC risk assessment / ICRA-style process + anti-ligature guidance",
    notes: "Biggest difference – HAI-SCRIBE has no direct HTM equivalent",
    effort: "high",
    templateKeys: ["template.health.room_ward_refresh", "template.health.theatre_refresh", "template.health.mhu_ligature_room_refresh"],
  },
];

export const REGULATION_CONVERSION_NOTES: { item: string; scotland: string; england: string; action: string }[] = [
  {
    item: "Core Technical HTMs/SHTMs",
    scotland: "SHTM 02-01, 03-01, 04-01, 06, 08-02, 08-03",
    england: "HTM 02-01, 03-01, 04-01, 06, 08-02, 08-03",
    action: "Simple find-and-replace of “SHTM” → “HTM”",
  },
  {
    item: "Fire Guidance",
    scotland: "SHTM 81 & SHTM 82",
    england: "HTM 05 series",
    action: "Update references and slightly adjust fire strategy language",
  },
  {
    item: "Infection Risk Process",
    scotland: "HAI-SCRIBE (4 formal stages)",
    england: "No direct equivalent – use local IPC procedures + HTM 00 principles",
    action: "Replace all HAI-SCRIBE sections with the England process",
  },
  {
    item: "Building Regulations",
    scotland: "Building Standards (Scotland)",
    england: "Building Regulations (England) + Approved Documents",
    action: "Update statutory references",
  },
  {
    item: "PSSR / Pressure Systems",
    scotland: "Same",
    england: "Same",
    action: "No change",
  },
  {
    item: "CIBSE / BSRIA / BS EN standards",
    scotland: "Same",
    england: "Same",
    action: "No change",
  },
];
