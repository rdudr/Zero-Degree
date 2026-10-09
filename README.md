# Zero Degree

AC, chiller and cooling-tower performance analysis for KISEM energy audits
(IIT Gandhinagar). Field engineers record readings on a phone — offline — and
the app works out every figure the KISEM analysis workbooks do, then produces
the PDF report and the Excel workbook PostMan reads.

Sibling of **Fox Kisem** and **A-CMP**: same stack, same team login, same
offline-first design.

## What it does

| Module | Workbook sheet(s) | Results |
|---|---|---|
| Air conditioners | Split - Window AC, PACKAGE AC, PACKAGE-AC-WITH MAKE-UP AIR | air flow, enthalpies, net TR, kcal/h, kW/TR, EER, % of rated |
| Chillers | CHILLER-VCS, CHILLER-VCS_CT, CHILLER-VAS, Chiller Heat Balance | TR generated, SPC (compressor / total), SFC & COP (VAS), % heat balance |
| AHUs | CHILLER AHU, CHILLER-AHU-WITH MAKE-UP AIR | air flow, net TR, kcal/h |
| Cooling towers | COOLING TOWER | fan air flow, L/G, range, approach, effectiveness, TR, evaporation, COC, blow-down, make-up |

- **Live calculation** on every form, with the worked formula and substitution.
- **Who recorded it:** every record carries the engineer, the time it was
  taken and the time it was last saved.
- **Duplicate protection:** a tag already recorded (case/spacing ignored) is
  refused with the name of the person who recorded it.
- **Team sharing:** Excel export / share / multi-file import, and a Team
  Cloud (upload / pull) — both merge by tag, newest save wins, never duplicate.
- **Reports:** PDF (cover, summary, per-unit working, charts, data record)
  and Excel; email to the KISEM admin team with both attached; offline queue
  with resend.
- **PostMan:** the Excel drops into PostMan; *Send to PostMan* hands it over
  directly when PostMan opened the app. Contract: [docs/POSTMAN.md](docs/POSTMAN.md).

## Run

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # formulas checked against the workbooks
npm run build      # production build (Vercel)
```

Login uses the KISEM team credentials (same as Fox Kisem, in `lib/auth-store.ts`).

## Deploy (Vercel)

Import the GitHub repo in Vercel (framework: Next.js, build command
`npm run build`). Environment variables — all optional, the app captures and
reports offline without any of them:

| Variable | For |
|---|---|
| `DATABASE_URL` | Team Cloud and a copy of every submitted report (Neon / Supabase Postgres). After adding it run `npx prisma db push` once against it. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | emailing reports through Gmail / SMTP (used first when set) |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | emailing through Resend instead |
| `NEXT_PUBLIC_API_URL` | the deployed URL the Android app sends to (default `https://zero-degree.vercel.app`) |
| `NEXT_PUBLIC_POSTMAN_ORIGINS` | extra PostMan deployments allowed to open the app |

## Android APK

```bash
npm run build:mobile   # static export into out/
npm run export:apk     # cap sync + gradle → <version>_Zero-Degree.apk
```
