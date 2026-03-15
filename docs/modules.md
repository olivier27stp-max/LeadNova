# Modules — Free Leads

## 1. Prospects
**File:** `src/app/prospects/page.tsx`
**API:** `src/app/api/prospects/*`

**Purpose:** Core entity management. Displays all prospects with filtering, sorting, bulk actions.

**Features:**
- List with TanStack Table (sorting, filtering by status/city/source)
- Discovery: trigger Google Search API to find new companies
- Enrichment: scrape websites to extract contact data
- Import: CSV/Excel file upload
- Bulk actions: archive, delete, add to campaign
- Inline lead score display
- Status badge (NEW → ENRICHED → CONTACTED → REPLIED → QUALIFIED)

**Key Interactions:**
- Writes to `Prospect` table
- Triggers `enrichment.ts` (Cheerio scraping)
- Triggers `discovery.ts` (Google Search)
- Reads enrichment progress from `EnrichmentProvider`
- Calls `logActivity()` on import/enrich/discover

**API Routes:**
```
GET    /api/prospects          — list with pagination + filters
POST   /api/prospects          — create single / deduplicate / fix cities
POST   /api/prospects/import   — CSV/Excel import
POST   /api/prospects/discover — start discovery job
GET    /api/prospects/enrich   — poll enrichment progress
POST   /api/prospects/enrich   — start enrichment job
DELETE /api/prospects/enrich   — cancel enrichment job
POST   /api/prospects/archive  — soft delete (sets archivedAt)
GET    /api/prospects/cities   — list distinct cities
```

---

## 2. Campaigns
**File:** `src/app/campaigns/page.tsx`, `src/app/campaigns/[id]/page.tsx`
**API:** `src/app/api/campaigns/*`

**Purpose:** Email campaign management with contact assignment.

**Features:**
- Campaign list with status (DRAFT/ACTIVE/PAUSED/COMPLETED)
- Campaign detail: two tabs
  - **Message tab**: edit email subject/body, follow-up template
  - **Contacts tab**: add/remove prospects from campaign
- Blacklist management (emails + domains to never contact)
- Sending limits: `maxPerDay`, `delayMinSeconds`, `delayMaxSeconds`

**Key Interactions:**
- Reads `Prospect` for contact list
- Writes `CampaignContact` pivot
- Writes `Campaign` settings
- Triggers `outreach.ts` for AI email generation
- Checks `Blacklist` before sending

**API Routes:**
```
GET    /api/campaigns              — list all campaigns
POST   /api/campaigns              — create campaign
PATCH  /api/campaigns              — update (name/status)
GET    /api/campaigns/[id]         — campaign detail
PATCH  /api/campaigns/[id]         — update campaign
GET    /api/campaigns/[id]/contacts — list contacts
POST   /api/campaigns/[id]/contacts — add contact(s)
DELETE /api/campaigns/[id]/contacts — remove contact
POST   /api/campaigns/[id]/follow-up — trigger follow-up send
```

---

## 3. Outreach (Email Generation & Sending)
**Files:** `src/lib/outreach.ts`, `src/lib/email-sender.ts`
**API:** `src/app/api/outreach/*`

**Purpose:** AI-powered personalized email generation and SMTP delivery.

**Email Generation:**
- Uses Anthropic Claude (`claude-sonnet-4-5`)
- Inputs: `COMPANY_INFO` + prospect data (company, city, industry)
- Fallback: `generateFallbackEmail()` if API fails
- Template variables: `{{company_name}}`, `{{city}}`, `{{contact_name}}`

**Email Sending:**
- Nodemailer with SMTP config from env
- Respects `maxPerDay` per campaign (tracked via `sentToday`)
- Random delay between emails: `delayMinSeconds` to `delayMaxSeconds`
- Checks Blacklist before each send
- Records `EmailActivity` on successful send

**API Routes:**
```
POST /api/outreach/generate — AI email generation
POST /api/outreach/send    — send email via SMTP
```

---

## 4. Discovery
**File:** `src/lib/discovery.ts`
**API:** `src/app/api/prospects/discover/route.ts`

**Purpose:** Find new prospect companies via Google Custom Search API.

**Process:**
1. Takes keyword + city combinations from `config.ts`
2. Queries Google Custom Search API (or Serper.dev fallback)
3. Extracts company names + Google Maps URLs from results
4. Creates `Prospect` records (status: NEW, source: "google_search")
5. Deduplicates via `(companyName, city)` unique constraint

**Progress tracking:** `src/lib/discovery-progress.ts` (in-memory)

---

## 5. Enrichment
**File:** `src/lib/enrichment.ts`
**API:** `src/app/api/prospects/enrich/route.ts`

**Purpose:** Scrape company websites to extract contact information.

**Extracted data per prospect:**
- Email address (or guessed format)
- Phone number
- Physical address
- LinkedIn URL
- Contact page URL

**Process:**
1. Fetch company website (from `website` or derived from `companyName`)
2. Parse HTML with Cheerio
3. Look for email patterns, phone patterns, contact links
4. Update `Prospect` record
5. Recalculate `leadScore` via `calculateLeadScore()`
6. Set status to `ENRICHED`

**Progress tracking:** `src/lib/enrich-progress.ts` (in-memory)
**UI:** `EnrichmentProvider` + `GlobalEnrichmentBar` (real-time polling)

---

## 6. Lead Scoring
**File:** `src/lib/lead-scoring.ts`

**Purpose:** Score prospects 0–60 based on data completeness + target fit.

**Scoring:**
| Criterion | Points |
|---|---|
| Has website | +20 |
| Has email | +15 |
| Has phone | +10 |
| City in TARGET_CITIES | +10 |
| Industry in TARGET_INDUSTRIES | +5 |
| **Max total** | **60** |

Called automatically after enrichment and on import.

---

## 7. Scrape Workflows
**API:** Managed via DB directly (no dedicated page yet)
**Models:** `ScrapeWorkflow`, `ScrapeCity`

**Purpose:** Automated sequential multi-city discovery jobs.

**Process:**
1. Create `ScrapeWorkflow` with keyword + city list
2. Iterate through `ScrapeCity` records by `sortOrder`
3. Run discovery for each city
4. Track `importedCount`, `duplicatesSkipped` per city
5. Stop if `consecutiveLowCities >= maxConsecutiveLow`

**Status flow:** `PENDING → IN_PROGRESS → COMPLETED/IMPORTED/SKIPPED/STOPPED`

---

## 8. Keywords
**API:** `src/app/api/keywords/*`

**Purpose:** Manage search keywords for discovery. AI-assisted generation.

**Features:**
- CRUD for keywords
- AI keyword generation from prompt (OpenAI or Claude)
- Whisper transcription (voice-to-keyword)
- `KeywordGeneration` model tracks generation history

---

## 9. Settings
**File:** `src/app/settings/page.tsx`
**API:** `src/app/api/settings/route.ts`
**Model:** `AppSettings` (singleton, `id: "singleton"`)

**Purpose:** App-wide configuration stored as JSON in DB.

**Typical settings:** SMTP config, company info, limits, etc.

---

## 10. Users & Auth
**API:** `src/app/api/users/*`
**Model:** `User`

**Purpose:** Internal user management. No public auth.

**Features:**
- CRUD (ADMIN only implied)
- Password hashing
- 2FA (TOTP) setup
- Roles: ADMIN / MANAGER / USER

**Note:** No session/JWT middleware currently. Single-tenant app.

---

## 11. Blacklist
**API:** `src/app/api/blacklist/route.ts`
**Model:** `Blacklist`

**Purpose:** Prevent emails from being sent to specific addresses or domains.

**Checks:** Applied in `email-sender.ts` before every send.
Both `email` (exact) and `domain` (suffix match) supported.

---

## 12. Email Templates
**API:** `src/app/api/templates/route.ts`
**Model:** `EmailTemplate`

**Purpose:** Reusable email templates for campaigns.

**Variables:** `{{company_name}}`, `{{city}}`, `{{contact_name}}`
Types: `custom`, system defaults (`isDefault: true`)

---

## 13. Dashboard
**File:** `src/app/page.tsx`
**API:** `src/app/api/dashboard/stats/route.ts`

**Purpose:** Overview metrics for the CRM.

**Stats:** Total prospects, by status, emails sent, reply rate, campaigns active, etc.
