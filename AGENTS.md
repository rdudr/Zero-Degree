<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Zero Degree — AC, chiller & cooling-tower field app

Field-capture app for KISEM energy audits (IIT Gandhinagar). Sibling of
**Fox Kisem** (electrical) and **A-CMP** (compressors) — same stack, same
login, same offline-first design. Outputs feed **PostMan**, the report
generator.

## Rules for agents
- The formulas in `lib/calc.ts` are the KISEM workbooks' own (AC Analysis,
  Chiller Analysis, Cooling Tower Analysis). Keep `npm test`
  (`scripts/calc-check.ts`) green — it checks them against the sheets'
  cached values.
- Do not rename fields in `lib/types.ts` / columns in `lib/excel.ts` without
  saying so — PostMan and the team import read them (see docs/POSTMAN.md).
- Used offline on plant roofs and plant rooms: no hard network dependency in
  the capture path; keep it legible on a phone in bright light.
