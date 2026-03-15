# Architecture — Free Leads

## System Overview

```
Browser (React 19)
    ↕ fetch()
Next.js App Router (API Routes)
    ↕ Prisma ORM
PostgreSQL (Supabase TCP)
    +
External APIs (Google, Anthropic, Serper, OpenAI, SMTP)
```

Single-server, single-tenant. No auth. No edge functions. No streaming (except enrichment polling).

---

## Frontend Architecture

### Layout
```
src/app/layout.tsx
  └─ ThemeProvider       — light/dark/system via localStorage
  └─ EnrichmentProvider  — global enrichment job state (React Context)
  └─ GlobalEnrichmentBar — progress bar for active enrichment
  └─ Header              — sticky nav: logo, nav links, theme toggle
  └─ {children}          — page content (max-w-7xl)
```

### Pages
All pages are `"use client"`. They fetch data from API routes on mount via `useEffect + fetch()`.
No server components with data fetching. No React Server Actions.

### State Management
- **Local state**: `useState` per page
- **Global enrichment state**: `EnrichmentProvider` context (polling every 2s)
- **No global store** (no Redux, no Zustand)

### Component Library
Custom shadcn-style components in `src/components/ui/`:
`badge`, `button`, `card`, `empty-state`, `input`, `logo`, `page-header`, `pagination`, `select`, `skeleton`, `stat-card`, `tabs`, `toast`

### Animations
Motion (Framer Motion) for:
- Page entry: `initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}`
- List items: staggered with `delay: index * 0.02`

---

## Backend Architecture

### API Routes (25 total)
Located at `src/app/api/`. All are Next.js Route Handlers (`route.ts`).

**Convention:**
```typescript
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  // ...
  return NextResponse.json({ data }, { status: 200 });
}
```

**Error pattern:**
```typescript
return NextResponse.json({ error: "Message" }, { status: 400 });
```

### Route Groups
```
/api/prospects/*        — CRUD + discover + enrich + import
/api/campaigns/*        — CRUD + contacts + follow-up
/api/outreach/*         — AI email generation + SMTP send
/api/keywords/*         — keyword management + AI generation
/api/blacklist          — email/domain blacklist
/api/dashboard/stats    — dashboard metrics
/api/settings           — app settings (singleton JSON)
/api/templates          — email templates
/api/users/*            — user management + password + 2FA
/api/activity-log       — audit log (legacy, kept for compatibility)
```

---

## Database Layer

### Connection
```typescript
// src/lib/db.ts
pg.Pool → PrismaPg adapter → PrismaClient
```
- `DATABASE_TCP_URL` env var
- Pool max: 5 connections
- SSL: `rejectUnauthorized: false`
- Singleton in development (`globalThis.prisma`)

### Critical Rule
**No `Promise.all` for DB queries.** Always sequential:
```typescript
// WRONG
const [a, b] = await Promise.all([prisma.x.findMany(), prisma.y.findMany()]);

// CORRECT
const a = await prisma.x.findMany();
const b = await prisma.y.findMany();
```

---

## Lead Generation Pipeline

```
1. DISCOVER
   └─ discovery.ts: Google Custom Search API / Serper.dev
   └─ Extracts company names + Google Maps URLs from search results
   └─ Creates Prospect records (status: NEW)

2. ENRICH
   └─ enrichment.ts: Cheerio web scraping
   └─ Fetches company website, extracts: email, phone, address, LinkedIn
   └─ Updates Prospect (status: ENRICHED), recalculates leadScore

3. SCORE
   └─ lead-scoring.ts: calculateLeadScore()
   └─ website: +20, email: +15, phone: +10, city match: +10, industry match: +5
   └─ Max score: 60

4. ASSIGN TO CAMPAIGN
   └─ CampaignContact pivot table
   └─ Many-to-many: Prospect ↔ Campaign

5. GENERATE EMAIL
   └─ outreach.ts: Anthropic Claude (claude-sonnet-4-5)
   └─ Uses COMPANY_INFO + prospect data for personalized email
   └─ Fallback: static template if AI fails

6. SEND EMAIL
   └─ email-sender.ts: Nodemailer SMTP
   └─ Respects maxPerDay + delayMinSeconds/delayMaxSeconds per campaign
   └─ Records EmailActivity on send

7. TRACK
   └─ EmailActivity: sentAt, openedAt, replyReceived, bounce
   └─ ActivityLog: audit trail for all actions
```

---

## Progress Tracking (Enrichment / Discovery)

Long-running jobs use an in-memory progress store + polling:

```
Client                          Server
  |                               |
  |— POST /api/prospects/enrich ——→| Start job (async, not awaited)
  |← { jobId }                   |
  |                               |
  |— GET /api/prospects/enrich   →| Poll progress every 2s
  |← { status, enriched, total } |
  |                               |
EnrichmentProvider (Context)      |
  └─ updates GlobalEnrichmentBar  |
```

Files: `src/lib/enrich-progress.ts`, `src/lib/discovery-progress.ts`

---

## Scrape Workflow (Automated Multi-City Discovery)

ScrapeWorkflow → many ScrapeCity → discovery per city → import to Prospect

Status flow: `PENDING → IN_PROGRESS → COMPLETED/IMPORTED/SKIPPED/STOPPED`

Dedup modes: `gmaps_url` (default) or `company_name+city`

---

## Theme System

`ThemeProvider` reads `localStorage("theme")` → applies `class="dark"` or `class="light"` on `<html>`.

3 modes: `light` | `dark` | `system` (follows OS)

CSS variables in `src/app/globals.css`:
- `--color-background`, `--color-foreground`, `--color-primary`, etc.
- `bg-card`, `text-foreground`, `border-border` — Tailwind 4 custom properties
