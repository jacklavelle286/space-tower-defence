# 0053. Staff and console screens look like professional software; the pupils' game keeps its look
Status: Proposed · Date: 2026-11-22

Context: the family edition's admin uses the game's playful heading font, Unkempt, with the system font for text, and
the pupils' learning panels use Andika, a font designed for beginning readers (`web/admin/src/global.css:65-67`,
`web/player/src/global.css:7`, `@fontsource/andika` in `web/shared`). The platform adds two sets of screens for adults:
the owner's console at `admin.` and the staff portal at `/staff` on each school's address. The owner, 2026-11-22: "the
admin portal and the teacher portal should be way more professional SaaS looking whlst still maintaining the same
branding - basically not using the same font as the student facing section" [CONFIRMED by owner 2026-11-22, PD-23].

Decision: two looks, one brand.
- The pupil app keeps the game's look: Unkempt, Andika and the game's art.
- The console and the staff portal share a professional look: one UI font for headings and text, dense tables and forms,
  and the same brand (name, logo, colours). Neither uses Unkempt or Andika.
- The UI font is **Inter** [PROPOSAL]: open-licence, made for screens, with tabular figures for tables. It is bundled
  with the apps and served from our own domain, as Andika and Unkempt are, so no font service sees schools' traffic.
- Each look is a set of design tokens (`--font-*`, colours, spacing) that the app sets. Shared components read the
  tokens and hard-code no fonts or colours, so one component serves both looks.

Alternatives: one look everywhere (ruled out by the owner: the pupils' fonts read as a children's product to staff); a
separate brand for staff (staff and pupils would not recognise each other's screens as one product); an off-the-shelf
component kit for the adult screens (a quick professional look, but a second component model beside today's; revisit
in the PS4 design pass if the tokens fall short).

Consequences: the console (CON-31, built from PS4) and the staff portal (SCH-40, from PS6) use the professional look;
the pupils' pages at `/` keep theirs. The brand kit (MKT-1) documents both looks. Contrast and focus checks run on both.
Shared components that hard-code a font or colour today are changed to read tokens when the console or portal first
uses them. Open: the font (Inter is proposed) and the palette's exact tones, settled with the owner in the PS4 design
pass.

Evidence: PD-23 ([README §3.1](../platform/README.md#31-confirmed-by-the-owner)); the font settings named above; stories
CON-31, SCH-40 and MKT-1 in Jira; the decision register
([14 §14](../platform/14-decision-register.md#14-new-owner-decisions-during-ps0)).
