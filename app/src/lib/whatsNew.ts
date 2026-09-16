// Hand-written, stakeholder-facing release highlights — not auto-
// generated from PR titles (those are written for me, not for a Trust/
// FM Contractor reader) and not a complete engineering changelog.
// git log is the full technical history; this is a curated subset of
// what a non-technical stakeholder would actually care about, in plain
// language. Add a new entry by hand when something worth telling that
// audience about ships — don't try to keep this in lockstep with every
// PR.
export type ReleaseNote = {
  date: string; // "24 Aug 2026"
  title: string;
  highlights: string[];
};

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    date: "16 Sep 2026",
    title: "Closed a network exposure in the desktop app's local server",
    highlights: [
      "The desktop app's local server was listening on every network interface instead of just this machine — meaning, in principle, another device on the same WiFi/network could have reached it. It now only ever listens on this machine (127.0.0.1), with no change to how the app itself behaves.",
    ],
  },
  {
    date: "16 Sep 2026",
    title: "Fixed the desktop app running outdated database migrations after an update",
    highlights: [
      "The desktop app keeps a local copy of its update/database tooling and only refreshed it on a brand-new install, never when updating an existing one — so an install upgraded in place could silently keep running an old version's database migrations forever, missing anything newer versions added. It now checks the installed version on every launch and refreshes that copy whenever it's changed, so updates always bring the database fully up to date.",
    ],
  },
  {
    date: "16 Sep 2026",
    title: "Water isolation and flushing now a real checklist item, not just after-the-fact records",
    highlights: [
      "Five templates that disturb potable water pipework — Domestic Hot & Cold Water Systems, Room or Ward Refresh, Mental Health Unit Ligature & Room Refresh, Theatre Refresh, and Water Treatment Plant Replacement — now ask for a Water Isolation Plan and a Flushing Plan (daily vs scheduled regime) up front, plus a point-of-use filter strategy and installation records where outlets need interim protection while the system settles after works. Previously this was only captured as records after the work was already done, or not asked for at all on the ward/theatre refresh templates.",
    ],
  },
  {
    date: "12 Sep 2026",
    title: "Email-based approval now works for any role, and AI can draft documents as well as review them",
    highlights: [
      "Email-based approval — until now Sponsor-only — now works for any dutyholder role, and can reach more than one contact at once. If several people hold the same role on a project, all of them are asked at the same time, so one person being away no longer blocks the project. If nobody replies in time, it can now automatically hand off to the next tier (for example, a more senior role) rather than just reminding the original requester.",
      "A Project Manager can now ask AI to draft a document, not just review one — a Statement of Work, a Gate 0 business case, or a CCN change-control workbook — built from several pieces of evidence already submitted to the project (a contractor quote, an inspection report, an email summary of a discussion). Like an AI review, a drafted document is always clearly marked as AI-generated and never counts as the real submitted evidence.",
    ],
  },
  {
    date: "11 Sep 2026",
    title: "Email-based gate approval is now live, AI document review, two more spend categories",
    highlights: [
      "Gate approval by email — announced as early groundwork a few days ago — is now fully working end-to-end and runs automatically. A Project Manager can ask an external contact who doesn't have a StageForge login (a Sponsor without system access, for example) to approve a gate; the request, the reply, and the resulting decision are all captured automatically, with the same audit trail as a normal in-app sign-off. If the contact doesn't reply, StageForge sends a reminder, then flags it back to the Project Manager to follow up directly — it never assumes silence means yes, and it never approves anything on its own.",
      "A Project Manager can now ask for an AI-generated review of a piece of submitted evidence — a RAMS document, a Statement of Work, an inspection report, a CDM planning document, or an SFG20 maintenance-gap comparison — directly from the gate. The review appears alongside the evidence it reviewed, clearly marked as an AI-generated review, never mistaken for or replacing the real evidence itself.",
      "Two more spend approval buckets: Serco Investment and Capital Project, alongside the existing Lifecycle Replacement, Small Works, and Variation.",
    ],
  },
  {
    date: "11 Sep 2026",
    title: "Undo an accidental bypass, and the first steps toward email-based approvals",
    highlights: [
      "Fixed a real gap: bypassing a deliverable by mistake used to be permanent — there was no way back to add the real evidence instead. An \"Undo bypass\" option now appears wherever a deliverable is bypassed, for the same person who could bypass it in the first place, with the same requirement to give a written reason.",
      "Early groundwork for an upcoming feature: projects can now hold a roster of external contacts (a Compliance Manager, an Authorised Person, a Water Group contact, etc.) who don't need a StageForge login of their own — the first step toward gate approvals being requested and recorded by email for people who aren't logged-in users of the system. Not yet wired into day-to-day use.",
    ],
  },
  {
    date: "11 Sep 2026",
    title: "Eight more system checklists, a full library-wide compliance audit, and Scotland-specific corrections",
    highlights: [
      "Eight more system checklists covering hospital systems that had none before: Catering/Kitchen Equipment, Laundry/Linen Services, Waste Management, Mortuary Services, Renewable/Net Zero Plant (solar, heat pumps, battery storage, EV charging), Building Fabric/External Envelope, Escalators, and non-domestic Water Treatment Plant — each with the same real regulatory grounding as the existing library.",
      "Every one of the (now 33) system checklists was independently reviewed end-to-end for two things: is anything a Project Manager genuinely needs missing, and is anything in there unnecessary. The good news on the second question — nothing unnecessary was found anywhere in the library.",
      "That review did turn up some real gaps, now closed: Legionella control for cooling towers on Chilled Water & Cooling projects, a fire-precautions reference for existing/occupied buildings (SHTM 85) on both fire checklists, a heads-up about the incoming international lift safety standard replacing the current one this year, and an asbestos survey requirement on Room/Ward/Theatre refresh projects before any wall, floor or door work starts.",
      "A number of citations across the library were corrected to the actual Scotland-specific rule rather than the generic or England/Wales one — Building Warrant instead of generic \"Building Regulations,\" Scotland's own water-fittings byelaws instead of the England/Wales regulations, and the actual NHS Scotland cyber-resilience framework named on Building Management System projects instead of a vague reference.",
    ],
  },
  {
    date: "10 Sep 2026",
    title: "Three new checklists, contractor vetting and dangerous-substances checks, several smaller compliance gaps closed",
    highlights: [
      "Three new checklists for systems that had none before: Automatic Doors, Fume Cupboards, and Fire Curtains — each with the same real regulatory grounding as the existing library (BS EN 16005/16034 for doors, BS EN 14175 and the COSHH-mandated 14-month exhaust-ventilation test cycle for fume cupboards, BS 8524 for fire curtains).",
      "PVG Scheme membership evidence for contractor personnel is now checked on every project before construction starts — previously nothing in the system asked for it.",
      "A dangerous-substances risk assessment (DSEAR) is now required before construction on any project involving flammable or pressurised substances — refrigerant, fuel supply, or compressed/medical gas.",
      "Radiation Protection Adviser sign-off is now a separate, explicit check for any project working in, adjacent to, above or below a CT/X-ray/imaging room — distinct from the existing infection-control check, since a job can pass that cleanly and still risk the room's lead shielding.",
      "Several smaller, more specific gaps closed: gas safety compliance evidence on boiler projects, anaesthetic-gas exposure monitoring on medical gas projects, an annual fire-damper test requirement on ventilation and fire-alarm projects, a periodic thermal-imaging survey requirement for electrical switchgear, and backflow-prevention/dialysis-water-treatment/water-cooler-hygiene checks on domestic water projects.",
    ],
  },
  {
    date: "3 Sep 2026",
    title: "Desktop trial now on the Microsoft Store, sign-in fix",
    highlights: [
      "StageForge Health's single-user desktop preview is now available directly from the Microsoft Store, rather than a manually-shared installer — search \"StageForge Health\" or use the link on the pmopassport.co.uk homepage.",
      "Fixed a sign-in issue affecting anyone whose email was originally entered with capital letters — they could never sign in, regardless of how they typed it themselves.",
    ],
  },
  {
    date: "31 Aug 2026",
    title: "New navigation, portfolio dashboard, sign-in email reliability",
    highlights: [
      "Replaced the top navigation bar with a persistent side menu, following feedback from the wider group — the project name, its status, and (for multi-contractor/CDM 2015 projects) that flag now sit together in one place at the top of every project page, instead of repeated across the page.",
      "The portfolio view now opens with an at-a-glance summary — total live projects, total budget with how much is approved, and how many deliverables/compliance items are outstanding across everything — before you get to the project-by-project list.",
      "That project list can now be searched by name/number and filtered by status, and each row shows a signed-off/total progress indicator for its current gate alongside a clearer status badge (e.g. \"Completed late\" now shown in red, not amber).",
      "Sign-in emails were intermittently landing in spam for new recipients — fixed by sending a properly branded email instead of the generic default template.",
      "The side menu now collapses to a simple \"Menu\" button on a phone-sized screen, and picks up Support and Documentation links (both placeholders for now, honestly labelled as such until there's real content behind them).",
    ],
  },
  {
    date: "26 Aug 2026",
    title: "Four more safety checks, sign-in activity tracking, PPM documentation requirement",
    highlights: [
      "Four more statutory safety checks now apply automatically wherever they're relevant — Work at Height, hot works permits, lone working, and asbestos refurbishment/demolition surveys — the same way StageForge already proposes fire risk and infection-control checks from a project's description.",
      "A platform admin can now see how much the team is actually using StageForge: every member's sign-in count and when they last logged in, alongside the existing list of people who tried and couldn't get in — both on the Access requests page.",
      "The 12 lifecycle-replacement checklists (Electrical, Domestic Hot & Cold Water, Boiler, Ventilation, Medical Gas, Chilled Water, Steam, Fire Suppression, Pneumatic Tube, and the three refresh templates) now also ask for valid PPM (Planned Preventative Maintenance) documentation for the plant being replaced, alongside the existing two-quote/lifecycle-approval requirement.",
      "The remaining 9 checklists (Lift, Nurse Call, BMS, Lighting, Fire Alarm, Security, Drainage, Above-ground Drainage, Compressed Air) now have that same competitive-quotes/lifecycle-cost-approval/PPM-documentation checkpoint too — previously only the other 12 asked for it.",
      "Checking an additional system when creating a new project now folds it into that same project's checklist — one combined set of gates — instead of creating a second, separate project.",
      "When a project does cover more than one system, its gates now group matching items from each system into a single shared checklist entry (rather than listing each system's version separately), and no longer show the same underlying item twice under two different names.",
      "New \"Mandatory approvals\" tab on every project: every Safety Group/Authorised Engineer/Authorised Person/statutory sign-off a project's own checklist calls for, whether someone's named against it yet, and whether it's actually been given.",
      "New \"Document templates\" page: a roadmap of which deliverables StageForge can (or will be able to) generate a pre-filled first-draft document for, using data already captured on the project — the Project Manager still reviews, edits, and owns the final version before uploading it as evidence.",
    ],
  },
  {
    date: "25 Aug 2026",
    title: "Real sign-in, passwordless email links, read-only demo links",
    highlights: [
      "Signing in is now required everywhere, replacing the open \"acting as\" switcher that used to be this demo's entire access model — the switcher survives as an admin-only preview tool layered on top of a real login.",
      "No password is ever created or stored for anyone. Sign in either with a company Microsoft account, or by email: enter your address and a one-time link is sent, valid only for someone a platform admin has already added.",
      "A platform admin can generate a read-only, expiring, revocable link for showing the demo to someone without giving them a real account — everything visible, nothing editable, until it expires or is revoked.",
      "Fixed an intermittent issue where clicking into a gate straight after loading a project with several gates could briefly look broken.",
      "New \"StageForge Health\" wordmark branding throughout.",
      "Fixed sign-in emails failing to deliver for anyone other than the platform admin's own address.",
      "A platform admin can now dismiss an access request once seen, and gets a clear on-screen alert (not just a nav-tucked page) whenever someone tries to sign in without access.",
    ],
  },
  {
    date: "24 Aug 2026",
    title: "Nine more system checklists, auto-populated project teams, clearer role switching",
    highlights: [
      "Nine more system checklists (Electrical, Chilled Water, Steam, Fire Suppression, Pneumatic Tube, Room/Ward Refresh, Mental Health Unit Ligature & Room Refresh, Theatre Refresh) now include a Pre-Contract Hold Point — no contractor is appointed until at least two competitive quotes and written lifecycle-cost approval are in place, closing a gap where detailed technical drawings were being requested before a project was even approved.",
      "New projects now auto-suggest which roles still need filling (Authorised Persons, Authorising Engineers, Principal Designer) based on the systems involved, with a live \"still needs assignment\" flag until a name is added.",
      "Project spend now requires the actual invoice to be uploaded before Finance can approve it — not just an amount and reference.",
      "The \"acting as\" switcher (standing in for separate logins in this demo) now leads with each person's role, not just their name.",
      "A new reference tool shows exactly what changes to run this system in England (HTM) instead of Scotland (SHTM), and can generate a full England-ready checklist library on demand — groundwork for whenever a Trust outside Scotland is onboarded.",
    ],
  },
  {
    date: "23 Aug 2026",
    title: "Multi-party sign-off, configurable approval authority, evidence storage",
    highlights: [
      "Compliance items that need more than one signature (e.g. HAI-SCRIBE needing both the Compliance Officer and the Client Authority) now support genuine parallel co-sign-off, rather than one person approving on everyone's behalf.",
      "Who can override a blocked compliance item, and who else must independently sign off, is now configurable per rule from an admin screen — no longer hardcoded.",
      "Authority roles are no longer a fixed list — a new role can be created and given override/bypass authority immediately, without a code change.",
      "Evidence files can now be stored in SharePoint rather than only on this server, once a Trust's SharePoint site is connected.",
      "A dedicated Team page for managing who's assigned to which role, project by project.",
    ],
  },
  {
    date: "20-22 Aug 2026",
    title: "Template library, financial tracking, portfolio view",
    highlights: [
      "The system checklist library grew to 9 discipline-specific templates (boiler & heating, water, ventilation, medical gases, fire alarm & detection, lifts, nurse call, BMS, electrical), each with its own regulatory citations and the right Authorised Person/Engineer requirement built in.",
      "A portfolio-wide view shows every project at a glance, plus a resource/capacity view showing who's allocated where and flagging anyone over 100%.",
      "Project spend now has a full PM to Finance approval workflow, with the ability to revise or delete a record before it's approved.",
      "Weekly scheduled email summaries for the SRO's portfolio review.",
      "Lessons learned are now recorded per gate and rolled up portfolio-wide, so patterns at the same stage across different projects are visible regardless of which project they came from.",
    ],
  },
  {
    date: "19 Aug 2026",
    title: "Compliance tracking goes live",
    highlights: [
      "Built out the underlying compliance rule library (the regulatory citations, evidence requirements, and override authority for each rule) and wired it into every project gate, so gates now show live compliance status alongside the delivery checklist, not just delivery on its own.",
    ],
  },
];
