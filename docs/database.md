# Database — Free Leads

## Connection
- Provider: PostgreSQL (Supabase)
- ORM: Prisma 7.4.2 with `@prisma/adapter-pg`
- Env: `DATABASE_TCP_URL`
- Generated client: `src/generated/prisma/` (do not edit manually)
- Migrate: `npx prisma migrate dev`
- Seed: `npx tsx prisma/seed.ts`

---

## Enums

```
ProspectStatus:   NEW | ENRICHED | CONTACTED | REPLIED | QUALIFIED | NOT_INTERESTED
CampaignStatus:   DRAFT | ACTIVE | PAUSED | COMPLETED
UserRole:         ADMIN | MANAGER | USER
ScrapeWorkflowStatus: ACTIVE | PAUSED | COMPLETED | STOPPED
ScrapeCityStatus: PENDING | IN_PROGRESS | COMPLETED | IMPORTED | SKIPPED | STOPPED
```

---

## Models

### Prospect (`prospects`)
Core entity. Represents a target company.

| Field | Type | Notes |
|---|---|---|
| id | String (cuid) | PK |
| companyName | String | Required |
| industry | String? | |
| city | String? | |
| address | String? | |
| phone | String? | |
| website | String? | |
| email | String? | Primary contact email |
| secondaryEmail | String? | |
| contactPageUrl | String? | |
| linkedinUrl | String? | |
| googleMapsUrl | String? | From discovery |
| emailGuessed | Boolean | default false |
| source | String? | e.g. "google_search", "csv_import" |
| status | ProspectStatus | default NEW |
| leadScore | Int | 0–60, recalculated on enrich |
| notes | String? | |
| contactType | String | default "prospect" (prospect/client/nouveau_client) |
| importBatchId | String? | Groups batch imports |
| archivedAt | DateTime? | Soft delete |

**Unique constraint:** `(companyName, city)` — prevents duplicates

**Indexes:** status, leadScore DESC, city, source, contactType, email, createdAt, companyName, importBatchId, archivedAt

**Relations:**
- `emailActivities` → EmailActivity[]
- `campaignContacts` → CampaignContact[]

---

### EmailActivity (`email_activity`)
Tracks every sent email.

| Field | Type | Notes |
|---|---|---|
| id | String (cuid) | PK |
| prospectId | String | FK → Prospect (cascade delete) |
| emailSubject | String | |
| emailBody | String | |
| sentAt | DateTime | default now() |
| openedAt | DateTime? | |
| replyReceived | Boolean | default false |
| bounce | Boolean | default false |

---

### Campaign (`campaigns`)
Email campaigns.

| Field | Type | Notes |
|---|---|---|
| id | String (cuid) | PK |
| name | String | |
| status | CampaignStatus | default DRAFT |
| emailSubject | String? | |
| emailBody | String? | |
| followUpSubject | String? | |
| followUpBody | String? | |
| maxPerDay | Int | default 30 |
| delayMinSeconds | Int | default 120 |
| delayMaxSeconds | Int | default 300 |
| sentToday | Int | default 0 |
| lastSentAt | DateTime? | |
| requireApproval | Boolean | default true |

**Relations:** `contacts` → CampaignContact[]

---

### CampaignContact (`campaign_contacts`)
Pivot: many-to-many Prospect ↔ Campaign.

| Field | Type | Notes |
|---|---|---|
| id | String (cuid) | PK |
| campaignId | String | FK → Campaign (cascade) |
| prospectId | String | FK → Prospect (cascade) |

**Unique constraint:** `(campaignId, prospectId)`

---

### Blacklist (`blacklist`)
Blocked emails or domains.

| Field | Type | Notes |
|---|---|---|
| id | String (cuid) | PK |
| email | String? | Unique |
| domain | String? | Unique |
| reason | String? | |

---

### AppSettings (`app_settings`)
Singleton JSON config storage.

| Field | Type | Notes |
|---|---|---|
| id | String | Fixed: `"singleton"` |
| data | Json | All settings as JSON |

---

### User (`users`)
Internal users (ADMIN / MANAGER / USER).

| Field | Type | Notes |
|---|---|---|
| id | String (cuid) | PK |
| name | String | |
| email | String | Unique |
| passwordHash | String? | |
| role | UserRole | default USER |
| active | Boolean | default true |
| twoFactorEnabled | Boolean | |
| twoFactorSecret | String? | |
| lastActiveAt | DateTime? | |

---

### EmailTemplate (`email_templates`)
Reusable email templates.

| Field | Type | Notes |
|---|---|---|
| id | String (cuid) | PK |
| name | String | |
| type | String | default "custom" |
| subject | String | |
| body | String | Supports `{{variables}}` |
| isDefault | Boolean | |
| archived | Boolean | |

**Template variables:** `{{company_name}}`, `{{city}}`, `{{contact_name}}`

---

### ActivityLog (`activity_logs`)
Audit trail for all significant actions.

| Field | Type | Notes |
|---|---|---|
| id | String (cuid) | PK |
| action | String | e.g. `enrichment_completed` |
| type | String | info / success / warning / error |
| title | String | Human-readable label |
| details | String? | Additional context |
| userId | String? | Optional user reference |
| relatedEntityType | String? | e.g. "campaign", "prospect" |
| relatedEntityId | String? | |
| importBatchId | String? | |
| metadata | Json | Extra structured data |
| isRead | Boolean | default false |

**Indexes:** createdAt, isRead, importBatchId, action

---

### KeywordGeneration (`keyword_generations`)
Stores AI keyword generation results.

| Field | Type | Notes |
|---|---|---|
| id | String (cuid) | PK |
| prompt | String | Input prompt |
| language | String | default "bilingual" |
| depth | String | default "standard" |
| angle | String | default "commercial" |
| maxKeywords | Int | default 50 |
| result | Json | Generated keywords |
| insertedCount | Int | Keywords inserted to DB |

---

### ScrapeWorkflow (`scrape_workflows`)
Automated multi-city discovery job.

| Field | Type | Notes |
|---|---|---|
| id | String (cuid) | PK |
| name | String | |
| keyword | String | Search keyword |
| country | String | default "Canada" |
| province | String? | |
| status | ScrapeWorkflowStatus | |
| minResultsThreshold | Int | Stop if below this |
| maxConsecutiveLow | Int | Max low-result cities before stop |
| cityLimit | Int? | Optional cap |
| dedupMode | String | "gmaps_url" or "company_name+city" |
| totalCities / completedCities / totalProspectsImported / duplicatesSkipped | Int | Progress counters |

**Relations:** `cities` → ScrapeCity[]

---

### ScrapeCity (`scrape_cities`)
Individual city within a ScrapeWorkflow.

| Field | Type | Notes |
|---|---|---|
| workflowId | String | FK → ScrapeWorkflow |
| cityName | String | |
| province | String? | |
| population | Int? | For sorting |
| sortOrder | Int | |
| status | ScrapeCityStatus | |
| searchUrl / resultsCount / importedCount / duplicatesCount | | Progress |
| scrapedAt | DateTime? | |

**Unique:** `(workflowId, cityName)`

---

## Entity Relationships

```
Prospect ──< CampaignContact >── Campaign
Prospect ──< EmailActivity
ScrapeWorkflow ──< ScrapeCity
```

All cascading deletes are set: deleting a Campaign deletes its CampaignContacts. Deleting a Prospect deletes its EmailActivities and CampaignContacts.
