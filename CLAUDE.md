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
src/lib/lead-scoring.ts — Score /100 profil Lume : courriel réel 20 (deviné 5), tél 10, site 5, ville 5, avis 20–300 → 20, CRM concurrent 30, industrie 10
src/lib/form-detection.ts — Détection formulaire de contact + CRM concurrent (Jobber…) ; choix du message de campagne par segment
src/lib/industry-groups.ts — Regroupe les catégories Google en grands métiers (filtre Segmentation de /prospects)
src/lib/owner-finder.ts  — IA (Claude) qui trouve le propriétaire sur le site (accueil, À propos, équipe, contact) ; nom et extrait vérifiés mot pour mot. Modèle : OWNER_AI_MODEL (défaut claude-opus-5-5)
src/lib/registration-finder.ts — Année d'immatriculation : 1) gratuit, regex sur le site (« fondée en », « depuis ») ; 2) mode économique Claude Haiku + 1–2 recherches web, citation vérifiée contre les extraits cités par l'API (REGISTRATION_MODE=precise → Opus qui ouvre les pages) ; sinon indice faible par date du nom de domaine (RDAP). Ciblage targeting.companyAge : après une découverte, la page date le lot (batchId) et seuls les prospects de l'âge voulu (sources sûres) vont dans la campagne choisie. Route : /api/prospects/find-registration (lots de 6). Filtres /api/prospects : age=lt3|gte3|lt5|gte5|gte10|unknown|pending, yearFrom, yearTo, ageSure=1
src/app/prospects/page.tsx — colonnes affichées/masquées choisies par l'utilisateur (localStorage « leadnova.prospects.hiddenColumns »)
src/lib/conversion-score.ts — Chance de conversion /10 (profil + signaux site/avis + appels + étape de vente), calculée à la volée
src/lib/engagement-score.ts — Engagement /10 (ouvertures, clics, visites du site, réponses, appels ; 🔥 = signal < 48 h)
src/lib/reviews.ts       — Avis Google récents (Outscraper si OUTSCRAPER_API_KEY, sinon Places 5 avis)
src/lib/tracking.ts      — Liens de clic signés (HMAC) ; routes publiques /api/track/{open,click,visit}
src/lib/reply-classifier.ts — Ton des réponses (positive/neutre/négative/absence/désabonnement) via Claude
src/lib/call-options.ts  — Listes du journal d'appels (résultat, qui, outil, objection, étape, raison de perte)
src/lib/sales-stages.ts  — Étapes du pipeline (réponse positive → setting call → closing call → inscrit → payant / perdu) ; clés DEMO_* = closing call, TRIAL = inscrit
src/lib/sales-pipeline.ts — setSalesStage / advanceSalesStage : seule façon de changer Prospect.salesStage (historique daté dans activity_logs « sales_stage », metadata { from, to })
src/app/funnel/page.tsx  — Page « Pipeline » : tableau glisser-déposer (@dnd-kit), filtre par campagne (ou toutes), KPI (réponse, réponse positive, courriel → inscription, inscription → payant) + funnel par période (/api/pipeline)
src/app/calls/page.tsx   — Page « Appels » : KPI, entonnoir, objections, calibrage de la Chance, rappels du jour, prospects chauds
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
OUTSCRAPER_API_KEY      — Google Maps scraping (primary discovery)
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
