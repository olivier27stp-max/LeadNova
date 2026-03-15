# Free Leads — AI Context File

## Project
AI-powered B2B lead generation & outreach CRM. French UI. Single-tenant.
- Prospects are companies (gestionnaires immobiliers in QC)
- Pipeline: Discover → Enrich → Score → Campaign → Send Email

## Stack
- **Next.js 16.1.6** (App Router, TypeScript)
- **React 19.2.3**
- **Prisma 7.4.2** + PostgreSQL (Supabase TCP pool)
- **Tailwind CSS 4**
- **Anthropic Claude API** (claude-sonnet-4-5) — AI email generation
- **Cheerio** — web scraping for enrichment
- **Nodemailer** — SMTP email sending
- **Motion** — animations
- **TanStack React Table** — data tables
- **Lucide React** — icons

## Pages (4 pages)
| Route | File |
|---|---|
| `/` | `src/app/page.tsx` — Dashboard stats |
| `/prospects` | `src/app/prospects/page.tsx` — Prospect list, discovery, enrichment |
| `/campaigns` | `src/app/campaigns/page.tsx` — Campaign list + blacklist |
| `/campaigns/[id]` | `src/app/campaigns/[id]/page.tsx` — Campaign editor (Message + Contacts tabs) |
| `/settings` | `src/app/settings/page.tsx` — App settings |

## Key Source Files
```
src/lib/db.ts           — Prisma client singleton (pg adapter)
src/lib/config.ts       — TARGET_CITIES, TARGET_INDUSTRIES, COMPANY_INFO
src/lib/enrichment.ts   — Web scraping (Cheerio), 64KB
src/lib/discovery.ts    — Google Search API discovery, 64KB
src/lib/outreach.ts     — Claude AI email generation
src/lib/lead-scoring.ts — Score: website+20, email+15, phone+10, city+10, industry+5
src/lib/activity.ts     — logActivity() helper
src/lib/email-sender.ts — Nodemailer SMTP
prisma/schema.prisma    — Full DB schema
```

## Critical Constraints
- **Sequential DB queries only** — Prisma pg pool (no `Promise.all` for DB calls)
- **DATABASE_TCP_URL** — required env var, never hardcode
- **French UI** — all labels/messages in French
- **No auth middleware** — single-tenant, no session required

## Env Vars Required
```
DATABASE_TCP_URL        — PostgreSQL connection string
ANTHROPIC_API_KEY       — Claude AI
GOOGLE_API_KEY          — Discovery
GOOGLE_CX               — Custom Search Engine ID
SERPER_API_KEY          — Alternative search
OPENAI_API_KEY          — Whisper transcription + keyword expansion
SMTP_HOST/USER/PASS     — Email sending
SMTP_FROM               — Sender address
```

## Coding Rules (enforced)
- All DB queries sequential (no Promise.all)
- `cn()` from `src/lib/utils.ts` for className merging
- UI components from `src/components/ui/`
- `logActivity()` after every significant user-triggered action
- Return `NextResponse.json()` with proper HTTP status codes
- No full file rewrites — patch only changed lines

## Detailed Docs
- Architecture: `docs/architecture.md`
- Database schema: `docs/database.md`
- Dev rules: `docs/rules.md`
- Module responsibilities: `docs/modules.md`
- AI interaction guidelines: `docs/ai-guidelines.md`
